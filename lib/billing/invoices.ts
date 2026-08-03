/**
 * Ciclo de vida de uma `BillingInvoice` — Foundation v1. Sempre em centavos
 * (`pricing.ts`), nunca imposto inventado, nunca nota fiscal, nunca cobrança
 * real — invoice é só representação de domínio. Toda transição de `status`
 * passa por `assertValidInvoiceTransition` (`status.ts`).
 */
import { assertValidInvoiceTransition } from "./status";
import { calculateInvoiceTotals } from "./pricing";
import { validateBillingInvoiceInput } from "./validation";
import type { BillingInvoice, BillingInvoiceItem, BillingSubscription, BillingValidationError } from "./types";

export class BillingInvoiceValidationFailedError extends Error {
  constructor(public readonly errors: BillingValidationError[]) {
    super(`billing_invoice_validation_failed: ${errors.map((e) => `${e.field} — ${e.message}`).join("; ")}`);
    this.name = "BillingInvoiceValidationFailedError";
  }
}

/** Gera a invoice do período ATUAL da assinatura — nunca cobra, só representa o que seria cobrado. */
export function generateInvoicePreview(subscription: BillingSubscription, id: string, now: string): BillingInvoice {
  const items: BillingInvoiceItem[] = subscription.items
    .filter((item) => item.recurring)
    .map((item) => ({
      id: `${id}-${item.id}`,
      description: item.description,
      referenceId: item.referenceId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: { amountCents: item.unitPrice.amountCents * item.quantity, currency: "BRL" },
    }));

  const totals = calculateInvoiceTotals(items, subscription.discounts, now);

  const invoice: BillingInvoice = {
    id,
    subscriptionId: subscription.id,
    tenantId: subscription.tenantId,
    status: "draft",
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    total: totals.total,
    dueAt: subscription.currentPeriodStart,
    items,
    createdAt: now,
  };

  const errors = validateBillingInvoiceInput(invoice);
  if (errors.length > 0) throw new BillingInvoiceValidationFailedError(errors);
  return invoice;
}

export function openInvoice(invoice: BillingInvoice): BillingInvoice {
  assertValidInvoiceTransition(invoice.status, "open");
  return { ...invoice, status: "open" };
}

export function markInvoicePaid(invoice: BillingInvoice, now: string): BillingInvoice {
  assertValidInvoiceTransition(invoice.status, "paid");
  return { ...invoice, status: "paid", paidAt: now };
}

export function markInvoiceOverdue(invoice: BillingInvoice): BillingInvoice {
  assertValidInvoiceTransition(invoice.status, "overdue");
  return { ...invoice, status: "overdue" };
}

export function voidInvoice(invoice: BillingInvoice): BillingInvoice {
  assertValidInvoiceTransition(invoice.status, "void");
  return { ...invoice, status: "void" };
}

export function cancelInvoice(invoice: BillingInvoice): BillingInvoice {
  assertValidInvoiceTransition(invoice.status, "cancelled");
  return { ...invoice, status: "cancelled" };
}

/** Só representação de domínio — nunca executa reembolso real num gateway. */
export function refundInvoicePreview(invoice: BillingInvoice): BillingInvoice {
  assertValidInvoiceTransition(invoice.status, "refunded");
  return { ...invoice, status: "refunded" };
}
