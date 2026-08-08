/**
 * Integrações da Marketplace / Module Licensing Foundation com as fundações
 * irmãs — v1. Cada fundação PRECEDENTE só pode ser CONSUMIDA (nunca
 * duplicada nem modificada): Billing decide entitlement financeiro,
 * Monitoring informa saúde operacional (nunca decide financeiro — mesma
 * separação estrutural documentada em `lib/billing/summary.ts`), Provisioning
 * recebe um view model de anexação (nunca um `ProvisioningPlan` real
 * modificado), Control Plane recebe um resumo anexado (nunca se registra de
 * volta nela — mesmo sentido único que outreach/automation-engine já usam).
 */
import { resolveBillingEntitlements } from "@/lib/billing/entitlements";
import type { BillingPlanDefinition, BillingSubscription } from "@/lib/billing/types";
import type { Installation } from "@/lib/control-plane/types";
import type { MonitoringSnapshot } from "@/lib/monitoring/types";
import type { ProvisioningPlan } from "@/lib/provisioning/types";

import type { MarketplaceBillingAuthorization, MarketplaceMonitoringHealth } from "./eligibility";
import type {
  MarketplaceEntitlementsResult,
  ModuleActivationPlan,
  ModuleLicense,
  ModuleTrial,
} from "./types";

// ---------------------------------------------------------------------------
// Billing — só pode NEGAR (nunca conceder além do Module Engine)
// ---------------------------------------------------------------------------

export type ResolveMarketplaceBillingInput = {
  installation: { deploymentPlan: string; modules: string[] };
  subscription: BillingSubscription;
  billingPlan: BillingPlanDefinition;
};

/** Roda `resolveBillingEntitlements` (Billing Engine) uma vez — reusar o resultado pra todos os módulos via `billingAuthorizationForModule`. */
export function resolveMarketplaceBillingEntitlements(input: ResolveMarketplaceBillingInput) {
  return resolveBillingEntitlements(input);
}

export function billingAuthorizationForModule(
  moduleId: string,
  billingResult: ReturnType<typeof resolveBillingEntitlements>,
): MarketplaceBillingAuthorization {
  const entry = billingResult.entitlements.find((e) => e.moduleId === moduleId);
  if (!entry) {
    return { authorized: false, requirement: `"${moduleId}" fora do catálogo de entitlement do Billing Engine`, blockers: [`"${moduleId}" não avaliado pelo Billing Engine`], warnings: [] };
  }
  return {
    authorized: entry.authorized,
    requirement: entry.authorized ? null : entry.reason,
    blockers: entry.authorized ? [] : [entry.reason],
    warnings: entry.restricted ? [entry.reason] : [],
  };
}

// ---------------------------------------------------------------------------
// Monitoring — só warning/bloqueio OPERACIONAL, nunca financeiro
// ---------------------------------------------------------------------------

const MODULE_HEALTH_CHECK_IDS: Record<string, string[]> = {
  "channel.whatsapp": ["whatsapp_channel_configured", "waha_available"],
  "channel.email": ["email_provider_configured"],
  "ai.agents": ["ai_gateway_configured"],
};

export function evaluateMonitoringHealthForModule(snapshot: MonitoringSnapshot | undefined, moduleId: string): MarketplaceMonitoringHealth {
  const relevantIds = MODULE_HEALTH_CHECK_IDS[moduleId] ?? [];
  if (relevantIds.length === 0 || !snapshot) {
    return { healthy: true, blockers: [], warnings: [] };
  }

  const relevantResults = snapshot.checks.filter((c) => relevantIds.includes(c.checkId));
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const result of relevantResults) {
    if (result.status === "unhealthy") blockers.push(`"${moduleId}" — check "${result.checkId}" indisponível: ${result.message}`);
    else if (result.status === "degraded") warnings.push(`"${moduleId}" — check "${result.checkId}" degradado: ${result.message}`);
  }

  return { healthy: blockers.length === 0, blockers, warnings };
}

// ---------------------------------------------------------------------------
// Provisioning — view model de anexação (nunca modifica um ProvisioningPlan real)
// ---------------------------------------------------------------------------

export type MarketplaceProvisioningAttachment = {
  provisioningPlanId: string;
  modulesToActivate: string[];
  additionalSteps: string[];
  blockers: string[];
  warnings: string[];
  requirements: string[];
  restartRecommended: boolean;
  deployRecommended: boolean;
  theoreticalRollback: string;
};

/** View model só pra REPRESENTAÇÃO — nunca escreve em `ProvisioningPlan` nem dispara `lib/provisioning/executor.ts`. */
export function attachMarketplaceActivationToProvisioningPlan(
  provisioningPlan: Pick<ProvisioningPlan, "id">,
  activationPlans: ModuleActivationPlan[],
): MarketplaceProvisioningAttachment {
  const toActivate = activationPlans.filter((p) => p.desiredState === "activated" && p.blockers.length === 0);

  return {
    provisioningPlanId: provisioningPlan.id,
    modulesToActivate: toActivate.map((p) => p.moduleId),
    additionalSteps: activationPlans.flatMap((p) => p.provisioningSteps),
    blockers: activationPlans.flatMap((p) => p.blockers),
    warnings: activationPlans.flatMap((p) => p.warnings),
    requirements: Array.from(new Set(activationPlans.flatMap((p) => p.requiredEnvironmentVariables))),
    restartRecommended: activationPlans.some((p) => p.requiresRestart),
    deployRecommended: activationPlans.some((p) => p.requiresDeploy),
    theoreticalRollback: "reverter é remover o(s) módulo(s) de ENABLED_MODULES / adicionar a DISABLED_MODULES — nenhuma infraestrutura real é criada nesta Foundation, então não há o que desfazer além da env var.",
  };
}

// ---------------------------------------------------------------------------
// Control Plane — attach (view model combinado, nunca escreve na Installation)
// ---------------------------------------------------------------------------

export type MarketplaceInstallationSummaryAttachment = {
  installationId: string;
  licensedModules: number;
  activeModules: number;
  trialModules: number;
  expiredModules: number;
  suspendedModules: number;
  addonModules: number;
  bundlesAttached: number;
  blockers: string[];
  availableUpgrades: string[];
  recommendedAction: string;
};

export function attachMarketplaceSummaryToInstallationSummary(
  installation: Pick<Installation, "id">,
  entitlementsResult: MarketplaceEntitlementsResult,
  licenses: ModuleLicense[],
  trials: ModuleTrial[],
): MarketplaceInstallationSummaryAttachment {
  const bundlesAttached = new Set(licenses.filter((l) => l.bundleId).map((l) => l.bundleId)).size;
  const activeTrials = trials.filter((t) => t.status === "active").length;

  const blockers = [...entitlementsResult.blockers];
  const availableUpgrades = entitlementsResult.deniedModules.filter((id) => !blockers.some((b) => b.includes(id)));

  let recommendedAction = "nenhuma ação necessária";
  if (entitlementsResult.suspendedModules.length > 0) recommendedAction = "regularizar assinatura para restaurar módulo(s) suspenso(s)";
  else if (entitlementsResult.expiredModules.length > 0) recommendedAction = "renovar licença(s) expirada(s)";
  else if (entitlementsResult.deniedModules.length > 0) recommendedAction = "revisar módulo(s) sem autorização comercial";

  return {
    installationId: installation.id,
    licensedModules: licenses.length,
    activeModules: entitlementsResult.authorizedModules.length,
    trialModules: activeTrials,
    expiredModules: entitlementsResult.expiredModules.length,
    suspendedModules: entitlementsResult.suspendedModules.length,
    addonModules: entitlementsResult.addonModules.length,
    bundlesAttached,
    blockers,
    availableUpgrades,
    recommendedAction,
  };
}
