import { describe, expect, it } from "vitest";

import { sanitizeBillingEvent, sanitizeBillingInvoice, sanitizeBillingSubscription, sanitizeDeep } from "@/lib/billing/sanitization";
import { generateInvoicePreview } from "@/lib/billing/invoices";
import { activateSubscription, createSubscription } from "@/lib/billing/subscriptions";

const NOW = "2026-01-01T00:00:00.000Z";

describe("sanitizeDeep reexportado — mesma função de lib/tenants/export, nunca reimplementada", () => {
  it("remove chaves sensíveis recursivamente", () => {
    const dirty = { token: "abc123", nested: { apiKey: "xyz", ok: "fine" } };
    const clean = sanitizeDeep(dirty) as typeof dirty;
    expect(clean).not.toHaveProperty("token");
    expect((clean as { nested: Record<string, unknown> }).nested).not.toHaveProperty("apiKey");
    expect((clean as { nested: Record<string, unknown> }).nested.ok).toBe("fine");
  });
});

describe("sanitizeBillingEvent", () => {
  it("sanitiza metadata.token de um evento", () => {
    const event = { id: "e1", tenantId: "t1", installationId: "i1", type: "invoice_paid" as const, occurredAt: NOW, message: "m", metadata: { token: "segredo" } };
    const sanitized = sanitizeBillingEvent(event);
    expect(sanitized.metadata).not.toHaveProperty("token");
  });
});

describe("sanitizeBillingSubscription / sanitizeBillingInvoice", () => {
  it("sanitiza providerRef quando presente", () => {
    const subscription = activateSubscription(
      createSubscription({ id: "sub-1", tenantId: "t1", installationId: "i1", planId: "pro", cycle: "monthly", startedAt: NOW }, NOW),
      NOW,
    );
    const withRef = { ...subscription, providerRef: { providerId: "fake", customerId: "cus_1", apiKey: "segredo" } as never };
    const sanitized = sanitizeBillingSubscription(withRef);
    expect(sanitized.providerRef).not.toHaveProperty("apiKey");
  });

  it("invoice sem providerRef não quebra (undefined permanece undefined)", () => {
    const subscription = activateSubscription(
      createSubscription({ id: "sub-1", tenantId: "t1", installationId: "i1", planId: "pro", cycle: "monthly", startedAt: NOW }, NOW),
      NOW,
    );
    const invoice = generateInvoicePreview(subscription, "inv-1", NOW);
    expect(sanitizeBillingInvoice(invoice).providerRef).toBeUndefined();
  });
});
