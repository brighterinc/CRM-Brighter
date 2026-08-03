import { describe, expect, it } from "vitest";

import {
  activateSubscription,
  addCycleDuration,
  BillingPlanChangeNotAllowedError,
  BillingSubscriptionValidationFailedError,
  cancelSubscription,
  changeSubscriptionPlan,
  createSubscription,
  expireGracePeriod,
  GracePeriodNotElapsedError,
  reactivateSubscription,
  renewSubscription,
  scheduleDowngrade,
  startGracePeriod,
  markSubscriptionPastDue,
  suspendSubscription,
} from "@/lib/billing/subscriptions";
import { InvalidSubscriptionTransitionError } from "@/lib/billing/status";

const NOW = "2026-01-01T00:00:00.000Z";

function baseInput(overrides: Partial<Parameters<typeof createSubscription>[0]> = {}) {
  return {
    id: "sub-1",
    tenantId: "tenant-1",
    installationId: "installation-1",
    planId: "pro",
    cycle: "monthly" as const,
    startedAt: NOW,
    ...overrides,
  };
}

describe("createSubscription", () => {
  it("nasce 'draft' sem trialDays", () => {
    const sub = createSubscription(baseInput(), NOW);
    expect(sub.status).toBe("draft");
    expect(sub.trialEndsAt).toBeUndefined();
  });

  it("nasce 'trial' com trialDays > 0, período = trialDays", () => {
    const sub = createSubscription(baseInput({ trialDays: 14 }), NOW);
    expect(sub.status).toBe("trial");
    expect(sub.trialEndsAt).toBe(sub.currentPeriodEnd);
  });

  it("lança erro estruturado pra planId inexistente", () => {
    expect(() => createSubscription(baseInput({ planId: "inexistente" }), NOW)).toThrow(BillingSubscriptionValidationFailedError);
  });

  it("lança erro estruturado pra ciclo não permitido no plano", () => {
    expect(() => createSubscription(baseInput({ cycle: "one_time" as never }), NOW)).toThrow(BillingSubscriptionValidationFailedError);
  });

  it("item base_plan reflete o plano contratado", () => {
    const sub = createSubscription(baseInput(), NOW);
    expect(sub.items).toHaveLength(1);
    expect(sub.items[0]?.type).toBe("base_plan");
    expect(sub.items[0]?.referenceId).toBe("pro");
  });
});

describe("activateSubscription", () => {
  it("draft → active reinicia o período a partir de 'now'", () => {
    const draft = createSubscription(baseInput(), NOW);
    const activated = activateSubscription(draft, "2026-02-01T00:00:00.000Z");
    expect(activated.status).toBe("active");
    expect(activated.currentPeriodStart).toBe("2026-02-01T00:00:00.000Z");
  });

  it("cancelled → active é transição inválida", () => {
    const cancelled = { ...createSubscription(baseInput(), NOW), status: "cancelled" as const };
    expect(() => activateSubscription(cancelled, NOW)).toThrow(InvalidSubscriptionTransitionError);
  });
});

describe("renewSubscription", () => {
  it("avança currentPeriodStart/End em +1 mês (monthly)", () => {
    const active = activateSubscription(createSubscription(baseInput(), NOW), NOW);
    const renewed = renewSubscription(active, active.currentPeriodEnd);
    expect(renewed.currentPeriodStart).toBe(active.currentPeriodEnd);
    expect(renewed.currentPeriodEnd).toBe(addCycleDuration(active.currentPeriodEnd, "monthly"));
    expect(renewed.status).toBe("active");
  });

  it("completa o cancelamento agendado no fim do período (cancelAtPeriodEnd)", () => {
    const active = activateSubscription(createSubscription(baseInput(), NOW), NOW);
    const cancelling = cancelSubscription(active, NOW, { immediate: false });
    const renewed = renewSubscription(cancelling, cancelling.currentPeriodEnd);
    expect(renewed.status).toBe("cancelled");
  });

  it("aplica downgrade agendado quando effectiveAt já chegou", () => {
    const dedicated = activateSubscription(createSubscription(baseInput({ planId: "dedicated" }), NOW), NOW);
    const scheduled = scheduleDowngrade(dedicated, "pro", "monthly", NOW);
    const renewed = renewSubscription(scheduled, scheduled.currentPeriodEnd);
    expect(renewed.planId).toBe("pro");
    expect(renewed.pendingPlanChange).toBeUndefined();
  });
});

describe("changeSubscriptionPlan", () => {
  it("upgrade é imediato", () => {
    const lite = activateSubscription(createSubscription(baseInput({ planId: "lite" }), NOW), NOW);
    const upgraded = changeSubscriptionPlan(lite, "pro", "monthly", NOW);
    expect(upgraded.planId).toBe("pro");
    expect(upgraded.pendingPlanChange).toBeUndefined();
  });

  it("downgrade é agendado pro fim do período, plano atual não muda ainda", () => {
    const dedicated = activateSubscription(createSubscription(baseInput({ planId: "dedicated" }), NOW), NOW);
    const downgraded = changeSubscriptionPlan(dedicated, "pro", "monthly", NOW);
    expect(downgraded.planId).toBe("dedicated");
    expect(downgraded.pendingPlanChange).toEqual({ planId: "pro", cycle: "monthly", effectiveAt: dedicated.currentPeriodEnd });
  });

  it("combinação fora do catálogo (nem upgrade nem downgrade) lança erro estruturado", () => {
    const pro = activateSubscription(createSubscription(baseInput({ planId: "pro" }), NOW), NOW);
    // pro → lite não está em upgradeTo nem downgradeTo de "pro" (downgradeTo de pro é ["lite"]... então isso É downgrade válido)
    // usar um caso realmente inválido: lite → lite não muda nada (no-op), então force via objeto malformado não é possível
    // aqui testamos dedicated → lite, que não está no catálogo (dedicated.downgradeTo = ["pro"] apenas)
    const dedicated = activateSubscription(createSubscription(baseInput({ planId: "dedicated" }), NOW), NOW);
    expect(() => changeSubscriptionPlan(dedicated, "lite", "monthly", NOW)).toThrow(BillingPlanChangeNotAllowedError);
    void pro;
  });
});

describe("cancelSubscription", () => {
  it("immediate: true cancela agora", () => {
    const active = activateSubscription(createSubscription(baseInput(), NOW), NOW);
    const cancelled = cancelSubscription(active, NOW, { immediate: true });
    expect(cancelled.status).toBe("cancelled");
  });

  it("immediate: false (default) só marca cancelAtPeriodEnd, status não muda ainda", () => {
    const active = activateSubscription(createSubscription(baseInput(), NOW), NOW);
    const cancelling = cancelSubscription(active, NOW);
    expect(cancelling.status).toBe("active");
    expect(cancelling.cancelAtPeriodEnd).toBe(true);
  });
});

describe("grace period e suspensão", () => {
  it("startGracePeriod usa o gracePeriodDays do plano quando não informado", () => {
    const pastDue = markSubscriptionPastDue(activateSubscription(createSubscription(baseInput({ planId: "pro" }), NOW), NOW), NOW);
    const graced = startGracePeriod(pastDue, NOW);
    expect(graced.status).toBe("grace_period");
    expect(graced.gracePeriodEndsAt).toBeDefined();
  });

  it("expireGracePeriod lança GracePeriodNotElapsedError se 'now' é anterior ao fim do grace period", () => {
    const pastDue = markSubscriptionPastDue(activateSubscription(createSubscription(baseInput(), NOW), NOW), NOW);
    const graced = startGracePeriod(pastDue, NOW);
    expect(() => expireGracePeriod(graced, NOW)).toThrow(GracePeriodNotElapsedError);
  });

  it("expireGracePeriod suspende quando 'now' já passou do fim do grace period", () => {
    const pastDue = markSubscriptionPastDue(activateSubscription(createSubscription(baseInput(), NOW), NOW), NOW);
    const graced = startGracePeriod(pastDue, NOW);
    const suspended = expireGracePeriod(graced, graced.gracePeriodEndsAt!);
    expect(suspended.status).toBe("suspended");
  });

  it("reactivateSubscription volta suspended → active e limpa gracePeriodEndsAt", () => {
    const suspended = suspendSubscription(activateSubscription(createSubscription(baseInput(), NOW), NOW), NOW);
    const reactivated = reactivateSubscription(suspended, NOW);
    expect(reactivated.status).toBe("active");
    expect(reactivated.gracePeriodEndsAt).toBeUndefined();
  });

  it("cancelled → suspended é transição inválida", () => {
    const cancelled = cancelSubscription(activateSubscription(createSubscription(baseInput(), NOW), NOW), NOW, { immediate: true });
    expect(() => suspendSubscription(cancelled, NOW)).toThrow(InvalidSubscriptionTransitionError);
  });
});
