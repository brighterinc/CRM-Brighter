/**
 * Reexporta `sanitizeDeep` (`@/lib/tenants/export`) — mesma função que
 * `lib/monitoring/sanitization.ts`/`lib/provisioning/logging.ts` já reusam.
 * Não existe uma segunda regex de chave sensível. Importa direto do
 * submódulo, nunca do barrel `@/lib/tenants` (que dispara leitura de
 * `process.env` via `current-installation.ts`).
 */
import { sanitizeDeep } from "@/lib/tenants/export";

import type { BillingEvent, BillingInvoice, BillingSubscription } from "./types";

export { sanitizeDeep };

export function sanitizeBillingEvent(event: BillingEvent): BillingEvent {
  return { ...event, metadata: event.metadata ? (sanitizeDeep(event.metadata) as Record<string, unknown>) : event.metadata };
}

/** `providerRef` já é sintético nesta Foundation, mas passa por `sanitizeDeep` mesmo assim — nunca confiar por construção. */
export function sanitizeBillingSubscription(subscription: BillingSubscription): BillingSubscription {
  return {
    ...subscription,
    providerRef: subscription.providerRef ? (sanitizeDeep(subscription.providerRef) as BillingSubscription["providerRef"]) : subscription.providerRef,
  };
}

export function sanitizeBillingInvoice(invoice: BillingInvoice): BillingInvoice {
  return {
    ...invoice,
    providerRef: invoice.providerRef ? (sanitizeDeep(invoice.providerRef) as BillingInvoice["providerRef"]) : invoice.providerRef,
  };
}
