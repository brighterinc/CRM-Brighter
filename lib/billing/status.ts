/**
 * Vocabulário fechado + transições do Brighter Billing Engine — Foundation v1.
 *
 * Mesma doutrina de `lib/control-plane/status.ts`/`lib/tenants/status.ts`:
 * arrays fechados como fonte da verdade, type guards derivados, e uma tabela
 * de transição explícita — nenhuma transição de `SubscriptionStatus` é
 * implícita ou "por dedução" dentro de `subscriptions.ts`.
 */
import type { InvoiceStatus, SubscriptionStatus } from "./types";

export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "draft",
  "trial",
  "active",
  "past_due",
  "grace_period",
  "suspended",
  "cancelled",
  "expired",
];

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as string[]).includes(value);
}

/** Status em que a assinatura ainda é considerada "viva" (não terminal). */
export const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "trial",
  "active",
  "past_due",
  "grace_period",
  "suspended",
];

/** Status terminal — nenhuma transição sai daqui nesta Foundation. */
export const TERMINAL_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["cancelled", "expired"];

/**
 * Tabela de transição — única fonte da verdade sobre o que é permitido.
 * `startGracePeriod`/`expireGracePeriod`/`suspendSubscription`/etc
 * (`subscriptions.ts`) NUNCA decidem por conta própria; todas consultam
 * `assertValidSubscriptionTransition`.
 */
export const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  draft: ["trial", "active", "cancelled"],
  trial: ["active", "past_due", "cancelled", "expired"],
  active: ["past_due", "grace_period", "suspended", "cancelled"],
  past_due: ["active", "grace_period", "cancelled"],
  grace_period: ["active", "suspended", "cancelled"],
  suspended: ["active", "cancelled"],
  cancelled: [],
  expired: [],
};

export class InvalidSubscriptionTransitionError extends Error {
  constructor(
    public readonly from: SubscriptionStatus,
    public readonly to: SubscriptionStatus,
  ) {
    super(`billing_invalid_transition: "${from}" → "${to}" não é uma transição permitida`);
    this.name = "InvalidSubscriptionTransitionError";
  }
}

/** Lança `InvalidSubscriptionTransitionError` se `from → to` não estiver em `SUBSCRIPTION_TRANSITIONS`. */
export function assertValidSubscriptionTransition(from: SubscriptionStatus, to: SubscriptionStatus): void {
  if (from === to) return;
  if (!SUBSCRIPTION_TRANSITIONS[from].includes(to)) {
    throw new InvalidSubscriptionTransitionError(from, to);
  }
}

export const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "open", "paid", "overdue", "void", "cancelled", "refunded"];

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (INVOICE_STATUSES as string[]).includes(value);
}

export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["open", "void"],
  open: ["paid", "overdue", "void", "cancelled"],
  overdue: ["paid", "void", "cancelled"],
  paid: ["refunded"],
  void: [],
  cancelled: [],
  refunded: [],
};

export class InvalidInvoiceTransitionError extends Error {
  constructor(
    public readonly from: InvoiceStatus,
    public readonly to: InvoiceStatus,
  ) {
    super(`billing_invalid_invoice_transition: "${from}" → "${to}" não é uma transição permitida`);
    this.name = "InvalidInvoiceTransitionError";
  }
}

export function assertValidInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (from === to) return;
  if (!INVOICE_TRANSITIONS[from].includes(to)) {
    throw new InvalidInvoiceTransitionError(from, to);
  }
}

/**
 * Recomendação operacional pra Control Plane/instalação — NUNCA executa
 * suspensão real (`installation.status` continua só da Control Plane).
 */
export type InstallationFinancialRecommendation = "keep_active" | "warn" | "grace_period" | "suspend_recommended";

export function recommendInstallationAction(status: SubscriptionStatus): InstallationFinancialRecommendation {
  switch (status) {
    case "draft":
    case "trial":
    case "active":
      return "keep_active";
    case "past_due":
      return "warn";
    case "grace_period":
      return "grace_period";
    case "suspended":
      return "suspend_recommended";
    case "cancelled":
    case "expired":
      return "suspend_recommended";
    default:
      return "keep_active";
  }
}
