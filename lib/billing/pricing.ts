/**
 * Aritmética monetária pura do Billing Engine — sempre em centavos, sempre
 * BRL nesta Foundation, nunca ponto flutuante. Reusa `formatCentsBRL`
 * (`@/lib/money.ts`) pra exibição — nunca reimplementa formatação.
 *
 * Regras não-negociáveis (spec §7/§8): total nunca negativo; desconto
 * percentual sempre 0–100; desconto fixo nunca ultrapassa o subtotal que
 * está descontando; imposto NUNCA é inventado (não existe campo de imposto
 * nesta Foundation — calcular imposto real é responsabilidade de uma fase
 * futura com gateway/nota fiscal).
 */
import type { BillingDiscount, BillingInvoiceItem, Money } from "./types";

export function money(amountCents: number): Money {
  return { amountCents: Math.max(0, Math.round(amountCents)), currency: "BRL" };
}

export function zeroMoney(): Money {
  return { amountCents: 0, currency: "BRL" };
}

export function addMoney(a: Money, b: Money): Money {
  return money(a.amountCents + b.amountCents);
}

export function sumMoney(items: Money[]): Money {
  return money(items.reduce((total, item) => total + item.amountCents, 0));
}

/** Nunca retorna centavos negativos — clampa em zero. */
export function subtractMoney(a: Money, b: Money): Money {
  return money(Math.max(0, a.amountCents - b.amountCents));
}

export function multiplyMoney(a: Money, quantity: number): Money {
  return money(a.amountCents * quantity);
}

/** Percentual clampado a [0, 100] antes de aplicar — nunca desconto negativo ou acima de 100%. */
export function applyPercentageDiscount(subtotalCents: number, percentage: number): number {
  const clamped = Math.min(100, Math.max(0, percentage));
  return Math.round((subtotalCents * clamped) / 100);
}

/** Nunca ultrapassa o subtotal que está descontando. */
export function applyFixedDiscount(subtotalCents: number, discountCents: number): number {
  return Math.min(Math.max(0, discountCents), subtotalCents);
}

/**
 * Soma o efeito de todos os `BillingDiscount` aplicáveis (por `appliesTo`/
 * `referenceId`) sobre um subtotal em centavos — clampada pra nunca
 * ultrapassar o próprio subtotal (mesmo com múltiplos descontos somados).
 */
export function calculateDiscountTotal(
  subtotalCents: number,
  discounts: BillingDiscount[],
  context: { target: BillingDiscount["appliesTo"]; referenceId?: string; now: string },
): number {
  const applicable = discounts.filter((d) => {
    if (d.appliesTo !== context.target) return false;
    if (d.referenceId && d.referenceId !== context.referenceId) return false;
    if (d.startsAt && context.now < d.startsAt) return false;
    if (d.endsAt && context.now > d.endsAt) return false;
    return true;
  });

  let discountCents = 0;
  for (const discount of applicable) {
    const remaining = subtotalCents - discountCents;
    if (remaining <= 0) break;
    discountCents +=
      discount.type === "percentage"
        ? applyPercentageDiscount(remaining, discount.value)
        : applyFixedDiscount(remaining, discount.value);
  }
  return Math.min(discountCents, subtotalCents);
}

export type InvoiceTotals = {
  subtotal: Money;
  discountTotal: Money;
  total: Money;
};

/** Calcula subtotal/desconto/total de uma invoice a partir dos itens + descontos aplicáveis a `invoice`. */
export function calculateInvoiceTotals(
  items: BillingInvoiceItem[],
  discounts: BillingDiscount[],
  now: string,
): InvoiceTotals {
  const subtotal = sumMoney(items.map((i) => i.amount));
  const discountCents = calculateDiscountTotal(subtotal.amountCents, discounts, { target: "invoice", now });
  const discountTotal = money(discountCents);
  const total = subtractMoney(subtotal, discountTotal);
  return { subtotal, discountTotal, total };
}

/** Aplica um `BillingCredit` sobre um total já calculado — nunca gera total negativo. */
export function applyCreditToTotal(total: Money, creditAmount: Money): { total: Money; creditUsed: Money } {
  const creditUsed = money(Math.min(total.amountCents, creditAmount.amountCents));
  return { total: subtractMoney(total, creditUsed), creditUsed };
}
