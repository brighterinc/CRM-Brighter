/**
 * Simulação determinística do Billing Engine — Foundation v1. Nenhum cenário
 * chama rede, gateway, banco ou Lumina; tudo é derivado das funções puras
 * dos demais módulos, com `now` sempre recebido por parâmetro (nunca
 * `Date.now()` interno) — os mesmos `now`/`installation` sempre produzem o
 * mesmo resultado.
 */
import type { Installation } from "@/lib/control-plane/types";

import { getBillingPlanDefinition } from "./catalog";
import { createBillingEvent } from "./events";
import { generateInvoicePreview, markInvoiceOverdue, markInvoicePaid, openInvoice } from "./invoices";
import { generateBillingSummary, type BillingOperationalSummary } from "./summary";
import {
  activateSubscription,
  addDaysIso,
  cancelSubscription,
  changeSubscriptionPlan,
  createSubscription,
  expireGracePeriod,
  markSubscriptionPastDue,
  reactivateSubscription,
  startGracePeriod,
} from "./subscriptions";
import type {
  BillingCredit,
  BillingDiscount,
  BillingEvent,
  BillingInvoice,
  BillingSubscription,
  BillingSubscriptionItem,
  BillingUsageSnapshot,
} from "./types";

export type BillingScenario =
  | "lite-active"
  | "pro-active"
  | "dedicated-active"
  | "trial"
  | "invoice-paid"
  | "invoice-overdue"
  | "payment-failed"
  | "grace-period"
  | "suspension-recommended"
  | "reactivation"
  | "upgrade-lite-to-pro"
  | "upgrade-pro-to-dedicated"
  | "downgrade-dedicated-to-pro"
  | "extra-module"
  | "usage-warning"
  | "usage-at-limit"
  | "usage-exceeded"
  | "cancel-at-period-end"
  | "cancel-immediate"
  | "discount-percentage"
  | "discount-fixed"
  | "credit";

export const BILLING_SCENARIOS: BillingScenario[] = [
  "lite-active",
  "pro-active",
  "dedicated-active",
  "trial",
  "invoice-paid",
  "invoice-overdue",
  "payment-failed",
  "grace-period",
  "suspension-recommended",
  "reactivation",
  "upgrade-lite-to-pro",
  "upgrade-pro-to-dedicated",
  "downgrade-dedicated-to-pro",
  "extra-module",
  "usage-warning",
  "usage-at-limit",
  "usage-exceeded",
  "cancel-at-period-end",
  "cancel-immediate",
  "discount-percentage",
  "discount-fixed",
  "credit",
];

export type BillingScenarioResult = {
  scenario: BillingScenario;
  subscription: BillingSubscription;
  invoice?: BillingInvoice;
  usage?: BillingUsageSnapshot;
  credit?: BillingCredit;
  summary: BillingOperationalSummary;
  events: BillingEvent[];
};

let syntheticIdCounter = 0;
function nextSyntheticId(prefix: string): string {
  syntheticIdCounter += 1;
  return `${prefix}-${syntheticIdCounter}`;
}

function baseUsage(installationId: string, tenantId: string, now: string, metrics: Record<string, number>): BillingUsageSnapshot {
  return {
    tenantId,
    installationId,
    periodStart: now,
    periodEnd: addDaysIso(now, 30),
    metrics,
    observedAt: now,
  };
}

/** Assinatura já `active`, no plano comercial de mesmo id que `installation.deploymentPlan`. */
function activeSubscriptionFor(installation: Installation, now: string, planId?: string): BillingSubscription {
  const draft = createSubscription(
    {
      id: nextSyntheticId("sub"),
      tenantId: installation.tenant.id,
      installationId: installation.id,
      planId: planId ?? installation.deploymentPlan,
      cycle: "monthly",
      startedAt: now,
    },
    now,
  );
  return activateSubscription(draft, now);
}

export function simulateBillingScenario(installation: Installation, scenario: BillingScenario, now: string): BillingScenarioResult {
  const tenantId = installation.tenant.id;
  const events: BillingEvent[] = [];
  const emit = (subscription: BillingSubscription, message: string, type: BillingEvent["type"]) =>
    events.push(createBillingEvent({ id: nextSyntheticId("evt"), tenantId, installationId: installation.id, subscriptionId: subscription.id, type, occurredAt: now, message }));

  let subscription: BillingSubscription;
  let invoice: BillingInvoice | undefined;
  let usage: BillingUsageSnapshot | undefined;
  let credit: BillingCredit | undefined;

  switch (scenario) {
    case "lite-active":
      subscription = activeSubscriptionFor(installation, now, "lite");
      break;
    case "pro-active":
      subscription = activeSubscriptionFor(installation, now, "pro");
      break;
    case "dedicated-active":
      subscription = activeSubscriptionFor(installation, now, "dedicated");
      break;
    case "trial": {
      subscription = createSubscription(
        { id: nextSyntheticId("sub"), tenantId, installationId: installation.id, planId: installation.deploymentPlan, cycle: "monthly", startedAt: now, trialDays: 14 },
        now,
      );
      emit(subscription, "trial iniciado (14 dias)", "trial_started");
      break;
    }
    case "invoice-paid": {
      subscription = activeSubscriptionFor(installation, now);
      invoice = markInvoicePaid(openInvoice(generateInvoicePreview(subscription, nextSyntheticId("inv"), now)), now);
      emit(subscription, "invoice paga", "invoice_paid");
      break;
    }
    case "invoice-overdue": {
      subscription = activeSubscriptionFor(installation, now);
      invoice = markInvoiceOverdue(openInvoice(generateInvoicePreview(subscription, nextSyntheticId("inv"), now)));
      emit(subscription, "invoice vencida sem pagamento", "invoice_overdue");
      break;
    }
    case "payment-failed": {
      const active = activeSubscriptionFor(installation, now);
      subscription = markSubscriptionPastDue(active, now);
      invoice = openInvoice(generateInvoicePreview(active, nextSyntheticId("inv"), now));
      emit(subscription, "pagamento falhou — assinatura em past_due", "payment_failed");
      break;
    }
    case "grace-period": {
      const pastDue = markSubscriptionPastDue(activeSubscriptionFor(installation, now), now);
      subscription = startGracePeriod(pastDue, now);
      emit(subscription, "grace period iniciado", "grace_period_started");
      break;
    }
    case "suspension-recommended": {
      const pastDue = markSubscriptionPastDue(activeSubscriptionFor(installation, now), now);
      const grace = startGracePeriod(pastDue, now);
      const afterGrace = addDaysIso(grace.gracePeriodEndsAt!, 1);
      subscription = expireGracePeriod(grace, afterGrace);
      emit(subscription, "grace period expirado — suspensão recomendada (nenhuma suspensão real executada)", "installation_suspension_recommended");
      break;
    }
    case "reactivation": {
      const pastDue = markSubscriptionPastDue(activeSubscriptionFor(installation, now), now);
      const grace = startGracePeriod(pastDue, now);
      const suspended = expireGracePeriod(grace, addDaysIso(grace.gracePeriodEndsAt!, 1));
      subscription = reactivateSubscription(suspended, now);
      emit(subscription, "assinatura reativada — reativação de instalação recomendada", "installation_reactivation_recommended");
      break;
    }
    case "upgrade-lite-to-pro": {
      const lite = activeSubscriptionFor(installation, now, "lite");
      subscription = changeSubscriptionPlan(lite, "pro", "monthly", now);
      emit(subscription, "upgrade imediato: lite → pro", "subscription_changed");
      break;
    }
    case "upgrade-pro-to-dedicated": {
      const pro = activeSubscriptionFor(installation, now, "pro");
      subscription = changeSubscriptionPlan(pro, "dedicated", "monthly", now);
      emit(subscription, "upgrade imediato: pro → dedicated", "subscription_changed");
      break;
    }
    case "downgrade-dedicated-to-pro": {
      const dedicated = activeSubscriptionFor(installation, now, "dedicated");
      subscription = changeSubscriptionPlan(dedicated, "pro", "monthly", now);
      emit(subscription, `downgrade agendado: dedicated → pro em ${subscription.pendingPlanChange?.effectiveAt}`, "subscription_changed");
      break;
    }
    case "extra-module": {
      const base = activeSubscriptionFor(installation, now, "lite");
      const plan = getBillingPlanDefinition("lite")!;
      const extraModuleId = plan.optionalModules[0];
      if (!extraModuleId) throw new Error("billing_scenario_extra_module: catálogo Lite não tem módulo opcional configurado");
      const extraItem: BillingSubscriptionItem = {
        id: nextSyntheticId("item"),
        type: "module",
        referenceId: extraModuleId,
        description: `Módulo extra: ${extraModuleId}`,
        quantity: 1,
        unitPrice: { amountCents: 990, currency: "BRL" },
        recurring: true,
      };
      subscription = { ...base, items: [...base.items, extraItem], updatedAt: now };
      emit(subscription, `módulo extra contratado: ${extraModuleId}`, "module_entitlement_changed");
      break;
    }
    case "usage-warning": {
      subscription = activeSubscriptionFor(installation, now);
      usage = baseUsage(installation.id, tenantId, now, { messagesPerMonth: 800, contacts: 1600 });
      break;
    }
    case "usage-at-limit": {
      subscription = activeSubscriptionFor(installation, now);
      usage = baseUsage(installation.id, tenantId, now, { messagesPerMonth: 1000, contacts: 2000 });
      break;
    }
    case "usage-exceeded": {
      subscription = activeSubscriptionFor(installation, now);
      usage = baseUsage(installation.id, tenantId, now, { messagesPerMonth: 1500, contacts: 2500 });
      emit(subscription, "consumo de mensagens/mês acima do limite contratado", "usage_limit_exceeded");
      break;
    }
    case "cancel-at-period-end": {
      const active = activeSubscriptionFor(installation, now);
      subscription = cancelSubscription(active, now, { immediate: false });
      emit(subscription, "cancelamento agendado pro fim do período", "subscription_changed");
      break;
    }
    case "cancel-immediate": {
      const active = activeSubscriptionFor(installation, now);
      subscription = cancelSubscription(active, now, { immediate: true });
      emit(subscription, "cancelamento imediato", "subscription_cancelled");
      break;
    }
    case "discount-percentage": {
      subscription = activeSubscriptionFor(installation, now);
      const discount: BillingDiscount = { id: nextSyntheticId("disc"), type: "percentage", value: 20, appliesTo: "invoice" };
      subscription = { ...subscription, discounts: [discount], updatedAt: now };
      invoice = openInvoice(generateInvoicePreview(subscription, nextSyntheticId("inv"), now));
      emit(subscription, "desconto percentual de 20% aplicado", "discount_applied");
      break;
    }
    case "discount-fixed": {
      subscription = activeSubscriptionFor(installation, now);
      const discount: BillingDiscount = { id: nextSyntheticId("disc"), type: "fixed", value: 5000, appliesTo: "invoice" };
      subscription = { ...subscription, discounts: [discount], updatedAt: now };
      invoice = openInvoice(generateInvoicePreview(subscription, nextSyntheticId("inv"), now));
      emit(subscription, "desconto fixo de R$ 50,00 aplicado", "discount_applied");
      break;
    }
    case "credit": {
      subscription = activeSubscriptionFor(installation, now);
      credit = { id: nextSyntheticId("credit"), tenantId, amount: { amountCents: 3000, currency: "BRL" }, reason: "crédito de demonstração — indicação", createdAt: now };
      emit(subscription, `crédito de ${credit.amount.amountCents} centavos aplicado`, "credit_applied");
      break;
    }
    default: {
      const exhaustive: never = scenario;
      throw new Error(`billing_scenario_unknown: ${exhaustive}`);
    }
  }

  const summary = generateBillingSummary(
    {
      installation: { id: installation.id, slug: installation.slug, company: installation.company, deploymentPlan: installation.deploymentPlan, modules: installation.modules },
      subscription,
      invoice,
      usage,
    },
    now,
  );

  return { scenario, subscription, invoice, usage, credit, summary, events };
}
