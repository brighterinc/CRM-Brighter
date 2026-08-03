import { describe, expect, it } from "vitest";

import { validateBillingDiscount, validateBillingInvoiceInput, validateBillingSubscriptionInput } from "@/lib/billing/validation";

describe("validateBillingDiscount", () => {
  it("percentual fora de 0-100 gera erro", () => {
    expect(validateBillingDiscount({ id: "d1", type: "percentage", value: 150, appliesTo: "invoice" })).toHaveLength(1);
    expect(validateBillingDiscount({ id: "d1", type: "percentage", value: -10, appliesTo: "invoice" })).toHaveLength(1);
  });

  it("percentual válido (0-100) não gera erro", () => {
    expect(validateBillingDiscount({ id: "d1", type: "percentage", value: 50, appliesTo: "invoice" })).toHaveLength(0);
  });

  it("fixo negativo gera erro", () => {
    expect(validateBillingDiscount({ id: "d1", type: "fixed", value: -100, appliesTo: "invoice" })).toHaveLength(1);
  });

  it("endsAt anterior a startsAt gera erro", () => {
    const errors = validateBillingDiscount({
      id: "d1",
      type: "fixed",
      value: 100,
      appliesTo: "invoice",
      startsAt: "2026-06-01T00:00:00.000Z",
      endsAt: "2026-01-01T00:00:00.000Z",
    });
    expect(errors).toHaveLength(1);
  });
});

describe("validateBillingSubscriptionInput", () => {
  it("planId inexistente gera erro de campo 'planId'", () => {
    const errors = validateBillingSubscriptionInput({ tenantId: "t1", installationId: "i1", planId: "inexistente", cycle: "monthly" });
    expect(errors.some((e) => e.field === "planId")).toBe(true);
  });

  it("ciclo não permitido no plano gera erro de campo 'cycle'", () => {
    const errors = validateBillingSubscriptionInput({ tenantId: "t1", installationId: "i1", planId: "lite", cycle: "one_time" });
    expect(errors.some((e) => e.field === "cycle")).toBe(true);
  });

  it("combinação válida não gera erro", () => {
    expect(validateBillingSubscriptionInput({ tenantId: "t1", installationId: "i1", planId: "lite", cycle: "monthly" })).toHaveLength(0);
  });
});

describe("validateBillingInvoiceInput — total nunca negativo, nunca diverge de subtotal-desconto", () => {
  it("total negativo gera erro", () => {
    const errors = validateBillingInvoiceInput({
      subtotal: { amountCents: 1000, currency: "BRL" },
      discountTotal: { amountCents: 0, currency: "BRL" },
      total: { amountCents: -1, currency: "BRL" },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("desconto maior que subtotal gera erro", () => {
    const errors = validateBillingInvoiceInput({
      subtotal: { amountCents: 1000, currency: "BRL" },
      discountTotal: { amountCents: 2000, currency: "BRL" },
      total: { amountCents: 0, currency: "BRL" },
    });
    expect(errors.some((e) => e.field === "discountTotal.amountCents")).toBe(true);
  });

  it("total consistente (subtotal - desconto) não gera erro", () => {
    const errors = validateBillingInvoiceInput({
      subtotal: { amountCents: 1000, currency: "BRL" },
      discountTotal: { amountCents: 200, currency: "BRL" },
      total: { amountCents: 800, currency: "BRL" },
    });
    expect(errors).toHaveLength(0);
  });
});
