import { describe, expect, it } from "vitest";

import { sanitizeDeep, sanitizeEnrollmentForExport, sanitizeOutreachLogPayload, sanitizeOutreachResponse, sanitizeSyntheticContact } from "@/lib/outreach/sanitization";
import type { OutreachEnrollment, OutreachResponse, OutreachSyntheticContact } from "@/lib/outreach/types";

describe("sanitizeDeep (reexportado de lib/tenants/export.ts)", () => {
  it("remove chave sensível em profundidade", () => {
    const result = sanitizeDeep({ ok: "valor", nested: { apiKey: "segredo", fine: 1 } });
    expect(result).toEqual({ ok: "valor", nested: { fine: 1 } });
  });
});

describe("sanitizeOutreachResponse", () => {
  it("sanitiza bodySanitized (defesa em profundidade — mesmo já supostamente sanitizado)", () => {
    const response: OutreachResponse = {
      id: "r1",
      enrollmentId: "e1",
      contactId: "c1",
      bodySanitized: "texto normal",
      receivedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(sanitizeOutreachResponse(response).bodySanitized).toBe("texto normal");
  });
});

describe("sanitizeSyntheticContact", () => {
  it("remove chave sensível de customFields", () => {
    const contact: OutreachSyntheticContact = {
      id: "c1",
      name: "Nome",
      phoneNumber: null,
      email: null,
      tags: [],
      customFields: { apiKey: "segredo", cargo: "CEO" },
      isBlocked: false,
      blockedReason: null,
      consent: {},
      ownerUserId: null,
    };
    const result = sanitizeSyntheticContact(contact);
    expect(result.customFields).toEqual({ cargo: "CEO" });
  });
});

describe("sanitizeEnrollmentForExport", () => {
  it("sanitiza o enrollment inteiro recursivamente", () => {
    const enrollment: OutreachEnrollment = {
      id: "e1",
      campaignId: "camp-1",
      cadenceId: "cad-1",
      contactId: "c1",
      status: "active",
      idempotencyKey: "camp-1:c1",
      attempts: 0,
      lastError: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const result = sanitizeEnrollmentForExport(enrollment);
    expect(result.id).toBe("e1");
  });
});

describe("sanitizeOutreachLogPayload", () => {
  it("remove token/secret/senha de um payload de log", () => {
    const payload = { event: "outreach.enrollment.created", token: "abc", password: "123", context: { secret: "xyz", ok: true } };
    const result = sanitizeOutreachLogPayload(payload);
    expect(result).toEqual({ event: "outreach.enrollment.created", context: { ok: true } });
  });
});
