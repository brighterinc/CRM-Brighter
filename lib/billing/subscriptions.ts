/**
 * Ciclo de vida de uma `BillingSubscription` — Foundation v1. Toda função é
 * pura: recebe `now` (ISO-8601 UTC) por parâmetro, nunca lê `Date.now()`
 * internamente, e nunca persiste/cobra. Toda transição de `status` passa por
 * `assertValidSubscriptionTransition` (`status.ts`) — nenhuma decisão
 * implícita.
 */
import { getBillingPlanDefinition, isDowngrade, isUpgrade } from "./catalog";
import { assertValidSubscriptionTransition } from "./status";
import { validateBillingSubscriptionInput } from "./validation";
import type { BillingCycle, BillingSubscription, BillingSubscriptionItem, BillingValidationError } from "./types";

export class BillingSubscriptionValidationFailedError extends Error {
  constructor(public readonly errors: BillingValidationError[]) {
    super(`billing_subscription_validation_failed: ${errors.map((e) => `${e.field} — ${e.message}`).join("; ")}`);
    this.name = "BillingSubscriptionValidationFailedError";
  }
}

export class BillingPlanChangeNotAllowedError extends Error {
  constructor(fromPlanId: string, toPlanId: string) {
    super(`billing_plan_change_not_allowed: "${fromPlanId}" → "${toPlanId}" não está no catálogo de upgrade/downgrade`);
    this.name = "BillingPlanChangeNotAllowedError";
  }
}

export class GracePeriodNotElapsedError extends Error {
  constructor(public readonly gracePeriodEndsAt: string) {
    super(`billing_grace_period_not_elapsed: grace period só termina em ${gracePeriodEndsAt}`);
    this.name = "GracePeriodNotElapsedError";
  }
}

const CYCLE_MONTHS: Record<BillingCycle, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
  one_time: 0,
};

/** Soma meses a uma data ISO — determinístico, nunca `Date.now()`. */
export function addCycleDuration(startIso: string, cycle: BillingCycle): string {
  const months = CYCLE_MONTHS[cycle];
  const d = new Date(startIso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

export function addDaysIso(startIso: string, days: number): string {
  const d = new Date(startIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function basePlanItem(subscriptionId: string, planId: string): BillingSubscriptionItem {
  const plan = getBillingPlanDefinition(planId);
  return {
    id: `${subscriptionId}-base-${planId}`,
    type: "base_plan",
    referenceId: planId,
    description: `Plano ${plan?.name ?? planId}`,
    quantity: 1,
    unitPrice: plan?.basePrice ?? { amountCents: 0, currency: "BRL" },
    recurring: true,
  };
}

export type CreateSubscriptionInput = {
  id: string;
  tenantId: string;
  installationId: string;
  planId: string;
  cycle: BillingCycle;
  startedAt: string;
  /** Dias de trial — ausente/0 = assinatura nasce `draft` (nunca `trial`). */
  trialDays?: number;
};

/** Assinatura nasce `draft` (sem trial) ou `trial` (com `trialDays > 0`) — nunca `active` diretamente. */
export function createSubscription(input: CreateSubscriptionInput, now: string): BillingSubscription {
  const errors = validateBillingSubscriptionInput(input);
  if (errors.length > 0) throw new BillingSubscriptionValidationFailedError(errors);

  const hasTrial = (input.trialDays ?? 0) > 0;
  const currentPeriodEnd = hasTrial
    ? addDaysIso(input.startedAt, input.trialDays!)
    : addCycleDuration(input.startedAt, input.cycle);

  return {
    id: input.id,
    tenantId: input.tenantId,
    installationId: input.installationId,
    planId: input.planId,
    cycle: input.cycle,
    status: hasTrial ? "trial" : "draft",
    startedAt: input.startedAt,
    currentPeriodStart: input.startedAt,
    currentPeriodEnd,
    cancelAtPeriodEnd: false,
    trialEndsAt: hasTrial ? currentPeriodEnd : undefined,
    items: [basePlanItem(input.id, input.planId)],
    discounts: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** `draft`/`trial` → `active`. Reinicia o período a partir de `now`. */
export function activateSubscription(subscription: BillingSubscription, now: string): BillingSubscription {
  assertValidSubscriptionTransition(subscription.status, "active");
  return {
    ...subscription,
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: addCycleDuration(now, subscription.cycle),
    updatedAt: now,
  };
}

/**
 * Avança pro próximo período. Se `cancelAtPeriodEnd`, o cancelamento se
 * completa aqui (nunca antes do fim do período contratado). Se houver
 * `pendingPlanChange` cujo `effectiveAt` já chegou, aplica o downgrade
 * agendado (`scheduleDowngrade`) neste momento — nunca antes.
 */
export function renewSubscription(subscription: BillingSubscription, now: string): BillingSubscription {
  if (subscription.cancelAtPeriodEnd) {
    assertValidSubscriptionTransition(subscription.status, "cancelled");
    return { ...subscription, status: "cancelled", updatedAt: now };
  }

  assertValidSubscriptionTransition(subscription.status, "active");

  const pending = subscription.pendingPlanChange;
  const applyPending = pending && pending.effectiveAt <= subscription.currentPeriodEnd;
  const planId = applyPending ? pending!.planId : subscription.planId;
  const cycle = applyPending ? pending!.cycle : subscription.cycle;

  return {
    ...subscription,
    status: "active",
    planId,
    cycle,
    items: applyPending ? [basePlanItem(subscription.id, planId)] : subscription.items,
    pendingPlanChange: applyPending ? undefined : pending,
    currentPeriodStart: subscription.currentPeriodEnd,
    currentPeriodEnd: addCycleDuration(subscription.currentPeriodEnd, cycle),
    updatedAt: now,
  };
}

/**
 * Upgrade é sempre imediato; downgrade é sempre agendado pro fim do período
 * atual (delega a `scheduleDowngrade`). Combinação fora do catálogo
 * (`upgradeTo`/`downgradeTo` de `catalog.ts`) lança `BillingPlanChangeNotAllowedError`.
 */
export function changeSubscriptionPlan(
  subscription: BillingSubscription,
  toPlanId: string,
  toCycle: BillingCycle,
  now: string,
): BillingSubscription {
  if (toPlanId === subscription.planId && toCycle === subscription.cycle) return subscription;

  const errors = validateBillingSubscriptionInput({ ...subscription, planId: toPlanId, cycle: toCycle });
  if (errors.length > 0) throw new BillingSubscriptionValidationFailedError(errors);

  if (isUpgrade(subscription.planId, toPlanId)) {
    return {
      ...subscription,
      planId: toPlanId,
      cycle: toCycle,
      items: [basePlanItem(subscription.id, toPlanId)],
      pendingPlanChange: undefined,
      updatedAt: now,
    };
  }
  if (isDowngrade(subscription.planId, toPlanId)) {
    return scheduleDowngrade(subscription, toPlanId, toCycle, now);
  }
  throw new BillingPlanChangeNotAllowedError(subscription.planId, toPlanId);
}

/** Agenda o downgrade pro fim do período atual — nunca aplicado antes de `renewSubscription`. */
export function scheduleDowngrade(
  subscription: BillingSubscription,
  toPlanId: string,
  toCycle: BillingCycle,
  now: string,
): BillingSubscription {
  return {
    ...subscription,
    pendingPlanChange: { planId: toPlanId, cycle: toCycle, effectiveAt: subscription.currentPeriodEnd },
    updatedAt: now,
  };
}

/** `immediate: true` cancela agora; senão marca `cancelAtPeriodEnd` (completa em `renewSubscription`). */
export function cancelSubscription(
  subscription: BillingSubscription,
  now: string,
  options: { immediate?: boolean } = {},
): BillingSubscription {
  if (options.immediate) {
    assertValidSubscriptionTransition(subscription.status, "cancelled");
    return { ...subscription, status: "cancelled", cancelAtPeriodEnd: false, updatedAt: now };
  }
  return { ...subscription, cancelAtPeriodEnd: true, updatedAt: now };
}

export function markSubscriptionPastDue(subscription: BillingSubscription, now: string): BillingSubscription {
  assertValidSubscriptionTransition(subscription.status, "past_due");
  return { ...subscription, status: "past_due", updatedAt: now };
}

/** Marca `suspended` diretamente — atalho administrativo. Prefira `startGracePeriod` → `expireGracePeriod`. */
export function suspendSubscription(subscription: BillingSubscription, now: string): BillingSubscription {
  assertValidSubscriptionTransition(subscription.status, "suspended");
  return { ...subscription, status: "suspended", updatedAt: now };
}

export function reactivateSubscription(subscription: BillingSubscription, now: string): BillingSubscription {
  assertValidSubscriptionTransition(subscription.status, "active");
  return { ...subscription, status: "active", gracePeriodEndsAt: undefined, updatedAt: now };
}

/** `gracePeriodDays` ausente usa o padrão do próprio plano (`catalog.ts`). */
export function startGracePeriod(subscription: BillingSubscription, now: string, gracePeriodDays?: number): BillingSubscription {
  assertValidSubscriptionTransition(subscription.status, "grace_period");
  const plan = getBillingPlanDefinition(subscription.planId);
  const days = gracePeriodDays ?? plan?.gracePeriodDays ?? 0;
  return { ...subscription, status: "grace_period", gracePeriodEndsAt: addDaysIso(now, days), updatedAt: now };
}

/** Lança `GracePeriodNotElapsedError` se `now` ainda estiver antes de `gracePeriodEndsAt`. */
export function expireGracePeriod(subscription: BillingSubscription, now: string): BillingSubscription {
  if (subscription.gracePeriodEndsAt && now < subscription.gracePeriodEndsAt) {
    throw new GracePeriodNotElapsedError(subscription.gracePeriodEndsAt);
  }
  assertValidSubscriptionTransition(subscription.status, "suspended");
  return { ...subscription, status: "suspended", updatedAt: now };
}
