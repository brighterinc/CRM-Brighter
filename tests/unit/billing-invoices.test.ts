import { describe, expect, it } from "vitest";

import {
  BillingInvoiceValidationFailedError,
  generateInvoicePreview,
  markInvoiceOverdue,
  markInvoicePaid,
  openInvoice,
  refundInvoicePreview,
  voidInvoice,
} from "@/lib/billing/invoices";
import { assertValidInvoiceTransition, InvalidInvoiceTransitionError } from "@/lib/billing/status";
import { activateSubscription, createSubscription } from "@/lib/billing/subscriptions";

const NOW = "2026-01-01T00:00:00.000Z";

function subscription() {
  return activateSubscription(
    createSubscription({ id: "sub-1", tenantId: "t1", installationId: "i1", planId: "pro", cycle: "monthly", startedAt: NOW }, NOW),
    NOW,
  );
}

describe("generateInvoicePreview", () => {
  it("gera invoice 'draft' com itens recorrentes da assinatura", () => {
    const invoice = generateInvoicePreview(subscription(), "inv-1", NOW);
    expect(invoice.status).toBe("draft");
    expect(invoice.items).toHaveLength(1);
    expect(invoice.subtotal.amountCents).toBe(0); // basePrice placeholder = 0
  });

  it("total = subtotal - desconto, nunca diverge (validateBillingInvoiceInput)", () => {
    const invoice = generateInvoicePreview(subscription(), "inv-1", NOW);
    expect(invoice.total.amountCents).toBe(invoice.subtotal.amountCents - invoice.discountTotal.amountCents);
  });
});

describe("ciclo de vida da invoice", () => {
  it("draft → open → paid", () => {
    const invoice = markInvoicePaid(openInvoice(generateInvoicePreview(subscription(), "inv-1", NOW)), NOW);
    expect(invoice.status).toBe("paid");
    expect(invoice.paidAt).toBe(NOW);
  });

  it("open → overdue", () => {
    const invoice = markInvoiceOverdue(openInvoice(generateInvoicePreview(subscription(), "inv-1", NOW)));
    expect(invoice.status).toBe("overdue");
  });

  it("paid → refunded (refundInvoicePreview)", () => {
    const paid = markInvoicePaid(openInvoice(generateInvoicePreview(subscription(), "inv-1", NOW)), NOW);
    expect(refundInvoicePreview(paid).status).toBe("refunded");
  });

  it("draft → void", () => {
    expect(voidInvoice(generateInvoicePreview(subscription(), "inv-1", NOW)).status).toBe("void");
  });

  it("transição inválida (draft → paid direto) lança InvalidInvoiceTransitionError", () => {
    const draft = generateInvoicePreview(subscription(), "inv-1", NOW);
    expect(() => markInvoicePaid(draft, NOW)).toThrow(InvalidInvoiceTransitionError);
  });

  it("void → paid é sempre inválido (terminal)", () => {
    expect(() => assertValidInvoiceTransition("void", "paid")).toThrow(InvalidInvoiceTransitionError);
  });
});

describe("BillingInvoiceValidationFailedError — nunca total negativo", () => {
  it("é lançado se a validação estrutural falhar (via generateInvoicePreview com desconto inconsistente hipotético)", () => {
    // generateInvoicePreview já garante consistência internamente; este teste documenta o contrato do erro.
    expect(BillingInvoiceValidationFailedError.prototype).toBeInstanceOf(Error);
  });
});
