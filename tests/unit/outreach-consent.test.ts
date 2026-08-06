import { describe, expect, it } from "vitest";

import { applySuppressionRules, deriveComplianceBlockers, deriveComplianceWarnings, evaluateContactEligibility, registerOptOutPreview } from "@/lib/outreach/consent";
import type { OutreachSyntheticContact } from "@/lib/outreach/types";

function contact(overrides: Partial<OutreachSyntheticContact> & { id: string }): OutreachSyntheticContact {
  return {
    name: "Nome",
    phoneNumber: "+5511999999999",
    email: "a@b.invalid",
    tags: [],
    customFields: {},
    isBlocked: false,
    blockedReason: null,
    consent: { marketing: { granted: true, grantedAt: "2026-01-01T00:00:00.000Z" } },
    ownerUserId: null,
    ...overrides,
  };
}

describe("evaluateContactEligibility", () => {
  it("contato elegível: sem blockers", () => {
    const result = evaluateContactEligibility(contact({ id: "c1" }), "whatsapp");
    expect(result.eligible).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("opt-out sempre bloqueia, mesmo com consentimento de marketing concedido", () => {
    const result = evaluateContactEligibility(contact({ id: "c1", isBlocked: true, blockedReason: "stop_keyword" }), "whatsapp");
    expect(result.eligible).toBe(false);
    expect(result.blockers.some((b) => b.includes("bloqueado"))).toBe(true);
  });

  it("sem consentimento de marketing bloqueia em canal externo", () => {
    const result = evaluateContactEligibility(contact({ id: "c1", consent: {} }), "email");
    expect(result.eligible).toBe(false);
  });

  it("canal internal não exige consentimento de marketing", () => {
    const result = evaluateContactEligibility(contact({ id: "c1", consent: {} }), "internal");
    expect(result.eligible).toBe(true);
  });

  it("sem e-mail bloqueia canal email", () => {
    const result = evaluateContactEligibility(contact({ id: "c1", email: null }), "email");
    expect(result.eligible).toBe(false);
  });

  it("legalBasisNote está sempre presente e é a mesma string (nenhuma regra jurídica nova inventada)", () => {
    const a = evaluateContactEligibility(contact({ id: "c1" }), "whatsapp");
    const b = evaluateContactEligibility(contact({ id: "c2", isBlocked: true }), "whatsapp");
    expect(a.legalBasisNote).toBe(b.legalBasisNote);
    expect(a.legalBasisNote.length).toBeGreaterThan(0);
  });

  it("consentimento sem grantedAt gera warning", () => {
    const result = evaluateContactEligibility(contact({ id: "c1", consent: { marketing: { granted: true } } }), "whatsapp");
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("registerOptOutPreview", () => {
  it("nunca escreve de verdade — só devolve o preview marcado irrevocable", () => {
    const preview = registerOptOutPreview("c1", "stop_keyword");
    expect(preview).toEqual({ contactId: "c1", blockedReason: "stop_keyword", irrevocable: true });
  });
});

describe("applySuppressionRules", () => {
  it("separa contatos elegíveis dos suprimidos", () => {
    const contacts = [contact({ id: "c1" }), contact({ id: "c2", isBlocked: true })];
    const result = applySuppressionRules(contacts, "whatsapp");
    expect(result.allowed).toEqual(["c1"]);
    expect(result.suppressed).toEqual(["c2"]);
  });
});

describe("deriveComplianceBlockers / deriveComplianceWarnings", () => {
  it("agrega blockers/warnings de múltiplas avaliações", () => {
    const evaluations = [evaluateContactEligibility(contact({ id: "c1", isBlocked: true }), "whatsapp"), evaluateContactEligibility(contact({ id: "c2" }), "whatsapp")];
    expect(deriveComplianceBlockers(evaluations).length).toBeGreaterThan(0);
    expect(deriveComplianceWarnings(evaluations)).toEqual([]);
  });
});
