import { describe, expect, it } from "vitest";

import { FakeBillingProviderAdapter, NoopBillingProviderAdapter } from "@/lib/billing/adapters";
import { generateInvoicePreview } from "@/lib/billing/invoices";
import { activateSubscription, createSubscription } from "@/lib/billing/subscriptions";

const NOW = "2026-01-01T00:00:00.000Z";

function subscription() {
  return activateSubscription(
    createSubscription({ id: "sub-1", tenantId: "t1", installationId: "i1", planId: "pro", cycle: "monthly", startedAt: NOW }, NOW),
    NOW,
  );
}

describe("NoopBillingProviderAdapter — nunca finge sucesso real", () => {
  it("createCheckoutPreview sempre simulated: true, providerId 'noop'", async () => {
    const adapter = new NoopBillingProviderAdapter();
    const result = await adapter.createCheckoutPreview({ subscription: subscription() });
    expect(result.simulated).toBe(true);
    expect(result.providerId).toBe("noop");
    expect(result.message).toMatch(/no-op/);
  });

  it("createChargePreview e cancelChargePreview também são no-op", async () => {
    const adapter = new NoopBillingProviderAdapter();
    const invoice = generateInvoicePreview(subscription(), "inv-1", NOW);
    const charge = await adapter.createChargePreview({ invoice });
    const cancel = await adapter.cancelChargePreview({ invoice });
    expect(charge.simulated).toBe(true);
    expect(cancel.simulated).toBe(true);
  });
});

describe("FakeBillingProviderAdapter — determinístico, ids sintéticos derivados do input", () => {
  it("gera o mesmo referenceId pro mesmo input (determinístico)", async () => {
    const adapter = new FakeBillingProviderAdapter();
    const sub = subscription();
    const r1 = await adapter.createCheckoutPreview({ subscription: sub });
    const r2 = await adapter.createCheckoutPreview({ subscription: sub });
    expect(r1.referenceId).toBe(r2.referenceId);
    expect(r1.referenceId).toContain(sub.id);
  });

  it("nunca chama rede — resultado não depende de I/O externo (mesmo sem qualquer mock de rede configurado)", async () => {
    const adapter = new FakeBillingProviderAdapter();
    const invoice = generateInvoicePreview(subscription(), "inv-1", NOW);
    const result = await adapter.createChargePreview({ invoice });
    expect(result.providerId).toBe("fake");
    expect(result.referenceId).toBe(`fake_chg_${invoice.id}`);
  });
});
