/**
 * Resumo financeiro do Billing Engine — Foundation v1.
 *
 * `attachBillingSummaryToInstallationSummary`/`generateBillingControlPlaneOverview`
 * são a integração com a Control Plane pedida nesta Foundation — NUNCA
 * alteram `Installation`/`ControlPlaneSummary` (`lib/control-plane/`);
 * produzem um view model próprio, mesmo padrão de
 * `lib/monitoring/summary.ts::attachMonitoringSnapshotToInstallationSummary`.
 *
 * **Separação Billing x Monitoring (spec §14) — doutrina, não sugestão:**
 * este arquivo NUNCA importa `MonitoringSnapshot`/`MonitoringIncident`
 * (`lib/monitoring/types.ts`). Uma instalação com assinatura `suspended`
 * NÃO é um incidente técnico — é uma `financialRecommendation`. Uma
 * instalação `unhealthy` no Monitoring NÃO é inadimplência — o Billing
 * nunca lê `MonitoringSnapshot` pra decidir cobrança, e o Monitoring nunca
 * lê `BillingSubscription` pra decidir saúde técnica. Os dois view models
 * (`InstallationMonitoringOverview`/`InstallationBillingOverview`) convivem
 * lado a lado na Control Plane sem se misturar — ver
 * `docs/billing/billing-engine.md` §"Separação Billing x Monitoring".
 */
import { formatCentsBRL } from "@/lib/money";
import type { Installation } from "@/lib/control-plane/types";

import { getBillingPlanDefinition } from "./catalog";
import { resolveBillingEntitlements } from "./entitlements";
import { recommendInstallationAction, type InstallationFinancialRecommendation } from "./status";
import { deriveUsageBlockers, deriveUsageWarnings, evaluateUsageAgainstLimits, suggestPlanUpgrade } from "./usage";
import type {
  BillingInvoice,
  BillingPendingPlanChange,
  BillingSubscription,
  BillingUsageSnapshot,
  BillingCycle,
  InvoiceStatus,
  SubscriptionStatus,
} from "./types";

export type BillingOperationalSummary = {
  installationId: string;
  slug: string;
  company: string;
  planId: string;
  planName: string;
  cycle: BillingCycle;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  pendingPlanChange?: BillingPendingPlanChange;
  includedModules: string[];
  extraModules: string[];
  unauthorizedModules: string[];
  usageWarnings: string[];
  usageBlockers: string[];
  suggestedUpgrade: string | null;
  invoiceStatus?: InvoiceStatus;
  invoiceTotalCents?: number;
  financialRecommendation: InstallationFinancialRecommendation;
  warnings: string[];
  blockers: string[];
  generatedAt: string;
};

export type GenerateBillingSummaryInput = {
  installation: Pick<Installation, "id" | "slug" | "company" | "deploymentPlan" | "modules">;
  subscription: BillingSubscription;
  invoice?: BillingInvoice;
  usage?: BillingUsageSnapshot;
};

export function generateBillingSummary(input: GenerateBillingSummaryInput, now: string): BillingOperationalSummary {
  const plan = getBillingPlanDefinition(input.subscription.planId);
  if (!plan) throw new Error(`billing_plan_not_found: "${input.subscription.planId}"`);

  const entitlements = resolveBillingEntitlements({
    installation: { deploymentPlan: input.installation.deploymentPlan, modules: input.installation.modules },
    subscription: input.subscription,
    billingPlan: plan,
  });

  const usageEvaluations = input.usage ? evaluateUsageAgainstLimits(input.usage, plan.limits) : [];
  const usageWarnings = deriveUsageWarnings(usageEvaluations);
  const usageBlockers = deriveUsageBlockers(usageEvaluations);

  return {
    installationId: input.installation.id,
    slug: input.installation.slug,
    company: input.installation.company,
    planId: plan.id,
    planName: plan.name,
    cycle: input.subscription.cycle,
    status: input.subscription.status,
    currentPeriodStart: input.subscription.currentPeriodStart,
    currentPeriodEnd: input.subscription.currentPeriodEnd,
    cancelAtPeriodEnd: input.subscription.cancelAtPeriodEnd,
    pendingPlanChange: input.subscription.pendingPlanChange,
    includedModules: entitlements.includedModules,
    extraModules: entitlements.extraModules,
    unauthorizedModules: entitlements.unauthorizedModules,
    usageWarnings,
    usageBlockers,
    suggestedUpgrade: suggestPlanUpgrade(plan.id, usageEvaluations),
    invoiceStatus: input.invoice?.status,
    invoiceTotalCents: input.invoice?.total.amountCents,
    financialRecommendation: recommendInstallationAction(input.subscription.status),
    warnings: [...entitlements.warnings, ...usageWarnings],
    blockers: [...entitlements.blockers, ...usageBlockers],
    generatedAt: now,
  };
}

export function renderBillingSummaryMarkdown(summary: BillingOperationalSummary): string {
  const lines: string[] = [
    `# Faturamento — ${summary.company} (${summary.slug})`,
    "",
    `- Plano comercial: ${summary.planName} (${summary.planId})`,
    `- Ciclo: ${summary.cycle}`,
    `- Situação financeira: ${summary.status}`,
    `- Período atual: ${summary.currentPeriodStart} → ${summary.currentPeriodEnd}`,
    `- Cancelamento agendado: ${summary.cancelAtPeriodEnd ? "sim" : "não"}`,
    ...(summary.pendingPlanChange
      ? [`- Mudança de plano agendada: → ${summary.pendingPlanChange.planId} em ${summary.pendingPlanChange.effectiveAt}`]
      : []),
    ...(summary.invoiceStatus
      ? [`- Última invoice: ${summary.invoiceStatus} (${formatCentsBRL(summary.invoiceTotalCents ?? 0)})`]
      : []),
    `- Próxima ação recomendada: ${summary.financialRecommendation}`,
    "",
    "## Módulos incluídos",
    ...(summary.includedModules.length > 0 ? summary.includedModules.map((m) => `- ${m}`) : ["- Nenhum."]),
    "",
    "## Módulos extras contratados",
    ...(summary.extraModules.length > 0 ? summary.extraModules.map((m) => `- ${m}`) : ["- Nenhum."]),
    "",
    "## Blockers",
    ...(summary.blockers.length > 0 ? summary.blockers.map((b) => `- ${b}`) : ["- Nenhum."]),
    "",
    "## Warnings",
    ...(summary.warnings.length > 0 ? summary.warnings.map((w) => `- ${w}`) : ["- Nenhum."]),
    "",
    `Sugestão de upgrade: ${summary.suggestedUpgrade ?? "nenhuma"}`,
  ];
  return lines.join("\n") + "\n";
}

/** View model combinado de UMA instalação — nunca modifica `Installation`/`ControlPlaneSummary`. */
export type InstallationBillingOverview = {
  installationId: string;
  slug: string;
  company: string;
  hasSubscription: boolean;
  planId: string | null;
  status: SubscriptionStatus | null;
  cancelAtPeriodEnd: boolean;
  nextRenewalAt: string | null;
  financialRecommendation: InstallationFinancialRecommendation;
};

export function attachBillingSummaryToInstallationSummary(
  installation: Pick<Installation, "id" | "slug" | "company">,
  subscription: BillingSubscription | null,
): InstallationBillingOverview {
  if (!subscription) {
    return {
      installationId: installation.id,
      slug: installation.slug,
      company: installation.company,
      hasSubscription: false,
      planId: null,
      status: null,
      cancelAtPeriodEnd: false,
      nextRenewalAt: null,
      financialRecommendation: "keep_active",
    };
  }

  return {
    installationId: installation.id,
    slug: installation.slug,
    company: installation.company,
    hasSubscription: true,
    planId: subscription.planId,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    nextRenewalAt: subscription.currentPeriodEnd,
    financialRecommendation: recommendInstallationAction(subscription.status),
  };
}

export type BillingControlPlaneOverview = {
  total: number;
  active: number;
  trial: number;
  pastDue: number;
  gracePeriod: number;
  suspended: number;
  cancelled: number;
  withoutSubscription: number;
  waitingFinancialAction: number;
  installations: InstallationBillingOverview[];
  generatedAt: string;
};

export function generateBillingControlPlaneOverview(
  installations: Array<Pick<Installation, "id" | "slug" | "company">>,
  subscriptionByInstallationId: Map<string, BillingSubscription>,
  now: string,
): BillingControlPlaneOverview {
  const overviews = installations.map((installation) =>
    attachBillingSummaryToInstallationSummary(installation, subscriptionByInstallationId.get(installation.id) ?? null),
  );

  return {
    total: overviews.length,
    active: overviews.filter((o) => o.status === "active").length,
    trial: overviews.filter((o) => o.status === "trial").length,
    pastDue: overviews.filter((o) => o.status === "past_due").length,
    gracePeriod: overviews.filter((o) => o.status === "grace_period").length,
    suspended: overviews.filter((o) => o.status === "suspended").length,
    cancelled: overviews.filter((o) => o.status === "cancelled").length,
    withoutSubscription: overviews.filter((o) => !o.hasSubscription).length,
    waitingFinancialAction: overviews.filter((o) => o.financialRecommendation !== "keep_active").length,
    installations: overviews,
    generatedAt: now,
  };
}
