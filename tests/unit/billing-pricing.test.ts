import { describe, expect, it } from "vitest";

import {
  addMoney,
  applyCreditToTotal,
  applyFixedDiscount,
  applyPercentageDiscount,
  calculateDiscountTotal,
  calculateInvoiceTotals,
  money,
  multiplyMoney,
  subtractMoney,
  sumMoney,
} from "@/lib/billing/pricing";
import type { BillingDiscount, BillingInvoiceItem } from "@/lib/billing/types";

describe("aritmética monetária — sempre centavos, nunca ponto flutuante", () => {
  it("addMoney soma centavos", () => {
    expect(addMoney(money(1000), money(250)).amountCents).toBe(1250);
  });

  it("subtractMoney nunca vai abaixo de zero", () => {
    expect(subtractMoney(money(100), money(500)).amountCents).toBe(0);
  });

  it("multiplyMoney multiplica por quantidade inteira", () => {
    expect(multiplyMoney(money(990), 3).amountCents).toBe(2970);
  });

  it("sumMoney soma uma lista", () => {
    expect(sumMoney([money(100), money(200), money(300)]).amountCents).toBe(600);
  });

  it("money() nunca aceita negativo (clampa em zero)", () => {
    expect(money(-500).amountCents).toBe(0);
  });
});

describe("desconto percentual", () => {
  it("aplica percentual corretamente", () => {
    expect(applyPercentageDiscount(10000, 20)).toBe(2000);
  });

  it("clampa percentual acima de 100 pra 100", () => {
    expect(applyPercentageDiscount(10000, 150)).toBe(10000);
  });

  it("clampa percentual negativo pra 0", () => {
    expect(applyPercentageDiscount(10000, -10)).toBe(0);
  });
});

describe("desconto fixo", () => {
  it("nunca ultrapassa o subtotal", () => {
    expect(applyFixedDiscount(1000, 5000)).toBe(1000);
  });

  it("aplica valor fixo normalmente quando menor que o subtotal", () => {
    expect(applyFixedDiscount(10000, 3000)).toBe(3000);
  });
});

describe("calculateDiscountTotal", () => {
  const now = "2026-06-01T00:00:00.000Z";

  it("ignora desconto de outro appliesTo/referenceId", () => {
    const discounts: BillingDiscount[] = [{ id: "d1", type: "percentage", value: 50, appliesTo: "module", referenceId: "core.crm" }];
    expect(calculateDiscountTotal(10000, discounts, { target: "invoice", now })).toBe(0);
  });

  it("respeita janela de validade (startsAt/endsAt)", () => {
    const discounts: BillingDiscount[] = [{ id: "d1", type: "percentage", value: 50, appliesTo: "invoice", startsAt: "2027-01-01T00:00:00.000Z" }];
    expect(calculateDiscountTotal(10000, discounts, { target: "invoice", now })).toBe(0);
  });

  it("soma múltiplos descontos sem nunca ultrapassar o subtotal", () => {
    const discounts: BillingDiscount[] = [
      { id: "d1", type: "percentage", value: 60, appliesTo: "invoice" },
      { id: "d2", type: "percentage", value: 60, appliesTo: "invoice" },
    ];
    expect(calculateDiscountTotal(10000, discounts, { target: "invoice", now })).toBeLessThanOrEqual(10000);
  });
});

describe("calculateInvoiceTotals — total nunca negativo", () => {
  const now = "2026-06-01T00:00:00.000Z";
  const items: BillingInvoiceItem[] = [
    { id: "i1", description: "Plano Pro", quantity: 1, unitPrice: money(0), amount: money(0) },
  ];

  it("subtotal zero, desconto zero, total zero", () => {
    const totals = calculateInvoiceTotals(items, [], now);
    expect(totals.subtotal.amountCents).toBe(0);
    expect(totals.total.amountCents).toBe(0);
  });

  it("desconto fixo maior que o subtotal nunca gera total negativo", () => {
    const paidItems: BillingInvoiceItem[] = [{ id: "i1", description: "item", quantity: 1, unitPrice: money(1000), amount: money(1000) }];
    const discounts: BillingDiscount[] = [{ id: "d1", type: "fixed", value: 99999, appliesTo: "invoice" }];
    const totals = calculateInvoiceTotals(paidItems, discounts, now);
    expect(totals.total.amountCents).toBe(0);
    expect(totals.discountTotal.amountCents).toBe(1000);
  });
});

describe("applyCreditToTotal", () => {
  it("nunca gera total negativo mesmo com crédito maior que o total", () => {
    const result = applyCreditToTotal(money(1000), money(5000));
    expect(result.total.amountCents).toBe(0);
    expect(result.creditUsed.amountCents).toBe(1000);
  });

  it("usa só o crédito necessário quando o crédito é menor que o total", () => {
    const result = applyCreditToTotal(money(1000), money(300));
    expect(result.total.amountCents).toBe(700);
    expect(result.creditUsed.amountCents).toBe(300);
  });
});
