import { describe, expect, it } from "vitest";

import { buildAudiencePreview, calculateAudienceSummary, excludeIneligibleContacts } from "@/lib/outreach/audiences";
import { deduplicateAudience, evaluateContactAgainstSegment, matchSegmentAudience } from "@/lib/outreach/segments";
import type { OutreachEnrollment, OutreachSegment, OutreachSyntheticContact } from "@/lib/outreach/types";

// NOTA: usa spread (nunca `overrides.x ?? default`) pra permitir override
// explícito com `null` (ex.: `phoneNumber: null`) — `??` trataria `null`
// explícito como "não fornecido" e voltaria pro default, mascarando o caso
// de teste "contato sem telefone".
function contact(overrides: Partial<OutreachSyntheticContact> & { id: string }): OutreachSyntheticContact {
  return {
    name: "Nome",
    phoneNumber: "+5511999999999",
    email: "a@b.invalid",
    tags: [],
    customFields: {},
    isBlocked: false,
    blockedReason: null,
    consent: { marketing: { granted: true } },
    ownerUserId: null,
    ...overrides,
  };
}

const baseSegment: OutreachSegment = {
  id: "seg-1",
  name: "Segmento teste",
  channel: "whatsapp",
  filters: [{ field: "tags", op: "contains", value: "vip" }],
  excludeContactIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("evaluateContactAgainstSegment", () => {
  it("contato com a tag casa", () => {
    expect(evaluateContactAgainstSegment(contact({ id: "c1", tags: ["vip"] }), baseSegment)).toBe(true);
  });

  it("contato sem a tag não casa", () => {
    expect(evaluateContactAgainstSegment(contact({ id: "c2", tags: ["comum"] }), baseSegment)).toBe(false);
  });

  it("excludeContactIds sempre vence, mesmo se os filtros casarem", () => {
    const segment = { ...baseSegment, excludeContactIds: ["c1"] };
    expect(evaluateContactAgainstSegment(contact({ id: "c1", tags: ["vip"] }), segment)).toBe(false);
  });

  it("múltiplos filtros são AND — todos precisam bater", () => {
    const segment: OutreachSegment = {
      ...baseSegment,
      filters: [
        { field: "tags", op: "contains", value: "vip" },
        { field: "name", op: "eq", value: "Ana" },
      ],
    };
    expect(evaluateContactAgainstSegment(contact({ id: "c1", tags: ["vip"], name: "Ana" }), segment)).toBe(true);
    expect(evaluateContactAgainstSegment(contact({ id: "c2", tags: ["vip"], name: "Bruno" }), segment)).toBe(false);
  });

  it("operador exists/not_exists sobre customFields", () => {
    const segment: OutreachSegment = { ...baseSegment, filters: [{ field: "customFields.cargo", op: "exists" }] };
    expect(evaluateContactAgainstSegment(contact({ id: "c1", customFields: { cargo: "CEO" } }), segment)).toBe(true);
    expect(evaluateContactAgainstSegment(contact({ id: "c2" }), segment)).toBe(false);
  });
});

describe("deduplicateAudience", () => {
  it("remove id repetido, mantém a primeira ocorrência", () => {
    const list = [contact({ id: "c1", name: "Primeiro" }), contact({ id: "c1", name: "Segundo" }), contact({ id: "c2" })];
    const result = deduplicateAudience(list);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("Primeiro");
  });
});

describe("matchSegmentAudience", () => {
  it("filtra contatos que casam com o segmento", () => {
    const contacts = [contact({ id: "c1", tags: ["vip"] }), contact({ id: "c2", tags: [] })];
    expect(matchSegmentAudience(baseSegment, contacts).map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("excludeIneligibleContacts", () => {
  it("opt-out tem precedência sobre qualquer outra regra", () => {
    const blocked = contact({ id: "c1", isBlocked: true, consent: {} });
    const result = excludeIneligibleContacts({ contacts: [blocked], channel: "whatsapp", campaignId: "camp-1", existingEnrollments: [] });
    expect(result.excluded).toEqual([{ contactId: "c1", reason: "opted_out" }]);
  });

  it("sem consentimento de marketing exclui em canal externo, mas não em internal", () => {
    const noConsent = contact({ id: "c1", consent: {} });
    const whatsapp = excludeIneligibleContacts({ contacts: [noConsent], channel: "whatsapp", campaignId: "camp-1", existingEnrollments: [] });
    expect(whatsapp.excluded[0]?.reason).toBe("no_marketing_consent");

    const internal = excludeIneligibleContacts({ contacts: [noConsent], channel: "internal", campaignId: "camp-1", existingEnrollments: [] });
    expect(internal.eligible).toHaveLength(1);
  });

  it("sem telefone exclui do canal whatsapp", () => {
    const noPhone = contact({ id: "c1", phoneNumber: null });
    const result = excludeIneligibleContacts({ contacts: [noPhone], channel: "whatsapp", campaignId: "camp-1", existingEnrollments: [] });
    expect(result.excluded[0]?.reason).toBe("no_channel_address");
  });

  it("já inscrito na mesma campanha é excluído", () => {
    const c = contact({ id: "c1" });
    const existingEnrollment: OutreachEnrollment = {
      id: "enr-1",
      campaignId: "camp-1",
      cadenceId: "cad-1",
      contactId: "c1",
      status: "active",
      idempotencyKey: "camp-1:c1",
      attempts: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const result = excludeIneligibleContacts({ contacts: [c], channel: "whatsapp", campaignId: "camp-1", existingEnrollments: [existingEnrollment] });
    expect(result.excluded[0]?.reason).toBe("already_enrolled");
  });

  it("contato elegível não é excluído", () => {
    const c = contact({ id: "c1" });
    const result = excludeIneligibleContacts({ contacts: [c], channel: "whatsapp", campaignId: "camp-1", existingEnrollments: [] });
    expect(result.eligible).toHaveLength(1);
    expect(result.excluded).toHaveLength(0);
  });
});

describe("buildAudiencePreview", () => {
  it("pipeline completo: casa segmento, deduplica, exclui inelegíveis, respeita maxAudienceSize", () => {
    const segment: OutreachSegment = { ...baseSegment, maxAudienceSize: 1 };
    const contacts = [
      contact({ id: "c1", tags: ["vip"] }),
      contact({ id: "c1", tags: ["vip"] }), // duplicado
      contact({ id: "c2", tags: ["vip"] }),
      contact({ id: "c3", tags: [] }), // não casa o segmento
      contact({ id: "c4", tags: ["vip"], isBlocked: true }),
    ];
    const preview = buildAudiencePreview({ segment, campaignId: "camp-1", contacts, existingEnrollments: [] });

    expect(preview.totalMatched).toBe(3); // c1 (deduplicado), c2, c4 — c3 nunca casa o filtro
    expect(preview.eligibleCount).toBe(1); // capado por maxAudienceSize
    expect(preview.cappedByMaxAudienceSize).toBe(true);
    expect(preview.excluded.some((e) => e.contactId === "c4" && e.reason === "opted_out")).toBe(true);
  });

  it("segmento sem público elegível devolve eligible vazio, nunca lança", () => {
    const preview = buildAudiencePreview({ segment: baseSegment, campaignId: "camp-1", contacts: [], existingEnrollments: [] });
    expect(preview.eligible).toEqual([]);
    expect(preview.totalMatched).toBe(0);
  });
});

describe("calculateAudienceSummary", () => {
  it("agrega contagem por motivo de exclusão", () => {
    const preview = buildAudiencePreview({
      segment: baseSegment,
      campaignId: "camp-1",
      contacts: [contact({ id: "c1", tags: ["vip"], isBlocked: true })],
      existingEnrollments: [],
    });
    const summary = calculateAudienceSummary(preview);
    expect(summary.excludedByReason.opted_out).toBe(1);
    expect(summary.excludedCount).toBe(1);
  });
});
