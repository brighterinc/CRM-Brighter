/**
 * Entitlement de módulo — a pergunta "este módulo está autorizado pra esta
 * instalação, considerando plano COMERCIAL + assinatura + o que o Module
 * Engine já resolveu tecnicamente?". Nunca liga/desliga nada de verdade —
 * `installation.modules` (Module Engine, via `DISABLED_MODULES`/
 * `allowedPlans`/dependência) continua tendo PRECEDÊNCIA operacional; o
 * Billing só pode NEGAR (nunca conceder) o que o Module Engine já autorizou
 * tecnicamente.
 *
 * Regras (spec §5):
 * - módulo `status: "planned"` nunca é autorizado em produção;
 * - módulo fora de `allowedPlans` do `deploymentPlan` nunca é autorizado;
 * - assinatura suspensa/cancelada NUNCA remove dado — só produz entitlement
 *   negativo + recomendação. Módulos `core.*` permanecem autorizados em modo
 *   restrito mesmo com assinatura suspensa (política documentada em
 *   `docs/billing/entitlements-and-limits.md`), pra o cliente nunca perder
 *   acesso de leitura aos próprios dados.
 */
import { MODULE_CATALOG, type ModuleDefinition } from "@/lib/modules/catalog";

import type { BillingLimits, BillingPlanDefinition, BillingSubscription, SubscriptionStatus } from "./types";

function isCoreModule(moduleId: string): boolean {
  return moduleId.startsWith("core.");
}

/** Status de assinatura em que o Billing recomenda restringir acesso não-core. */
function isSubscriptionBlocking(status: SubscriptionStatus): boolean {
  return status === "suspended" || status === "cancelled" || status === "expired";
}

export type ModuleEntitlementSource =
  | "included"
  | "optional_extra_purchased"
  | "optional_extra_not_purchased"
  | "not_in_commercial_plan"
  | "plan_not_allowed"
  | "planned_status"
  | "blocked_by_module_engine"
  | "restricted_core_during_suspension"
  | "blocked_by_subscription_status";

export type ModuleEntitlement = {
  moduleId: string;
  authorized: boolean;
  restricted: boolean;
  source: ModuleEntitlementSource;
  reason: string;
};

export type ResolveBillingEntitlementsInput = {
  installation: { deploymentPlan: string; modules: string[] };
  subscription: BillingSubscription;
  billingPlan: BillingPlanDefinition;
  moduleCatalog?: ModuleDefinition[];
};

export type BillingEntitlementsResult = {
  entitlements: ModuleEntitlement[];
  authorizedModules: string[];
  unauthorizedModules: string[];
  includedModules: string[];
  extraModules: string[];
  blockedByModuleEngine: string[];
  limits: BillingLimits;
  warnings: string[];
  blockers: string[];
};

export function resolveBillingEntitlements(input: ResolveBillingEntitlementsInput): BillingEntitlementsResult {
  const catalog = input.moduleCatalog ?? MODULE_CATALOG;
  const purchasedExtraIds = new Set(
    input.subscription.items.filter((i) => i.type === "module").map((i) => i.referenceId),
  );
  const subscriptionBlocking = isSubscriptionBlocking(input.subscription.status);

  const entitlements: ModuleEntitlement[] = catalog.map((moduleDef) => {
    const id = moduleDef.id;
    const technicallyEnabled = input.installation.modules.includes(id);

    if (moduleDef.status === "planned") {
      return { moduleId: id, authorized: false, restricted: false, source: "planned_status", reason: `"${id}" está planned — nunca autorizado em produção` };
    }
    if (!moduleDef.allowedPlans.includes(input.billingPlan.deploymentPlan)) {
      return { moduleId: id, authorized: false, restricted: false, source: "plan_not_allowed", reason: `"${id}" não é permitido no plano de implantação "${input.billingPlan.deploymentPlan}"` };
    }

    const included = input.billingPlan.includedModules.includes(id);
    const optional = input.billingPlan.optionalModules.includes(id);

    let source: ModuleEntitlementSource;
    let commerciallyAuthorized: boolean;
    if (included) {
      source = "included";
      commerciallyAuthorized = true;
    } else if (optional && purchasedExtraIds.has(id)) {
      source = "optional_extra_purchased";
      commerciallyAuthorized = true;
    } else if (optional) {
      source = "optional_extra_not_purchased";
      commerciallyAuthorized = false;
    } else {
      source = "not_in_commercial_plan";
      commerciallyAuthorized = false;
    }

    if (!technicallyEnabled) {
      return { moduleId: id, authorized: false, restricted: false, source: "blocked_by_module_engine", reason: `"${id}" não está habilitado tecnicamente pelo Module Engine (DISABLED_MODULES/dependência/plano)` };
    }

    if (!commerciallyAuthorized) {
      return { moduleId: id, authorized: false, restricted: false, source, reason: `"${id}" não está incluído no plano comercial "${input.billingPlan.id}"` };
    }

    if (subscriptionBlocking) {
      if (isCoreModule(id)) {
        return { moduleId: id, authorized: true, restricted: true, source: "restricted_core_during_suspension", reason: `"${id}" é core — permanece acessível em modo restrito mesmo com assinatura "${input.subscription.status}"` };
      }
      return { moduleId: id, authorized: false, restricted: false, source: "blocked_by_subscription_status", reason: `assinatura "${input.subscription.status}" — "${id}" perde autorização até regularização` };
    }

    return { moduleId: id, authorized: true, restricted: false, source, reason: `"${id}" autorizado (${source})` };
  });

  const authorizedModules = entitlements.filter((e) => e.authorized).map((e) => e.moduleId);
  const unauthorizedModules = entitlements.filter((e) => !e.authorized).map((e) => e.moduleId);
  const includedModules = entitlements.filter((e) => e.source === "included" && e.authorized).map((e) => e.moduleId);
  const extraModules = entitlements.filter((e) => e.source === "optional_extra_purchased" && e.authorized).map((e) => e.moduleId);
  const blockedByModuleEngine = entitlements.filter((e) => e.source === "blocked_by_module_engine").map((e) => e.moduleId);

  const warnings: string[] = [];
  const blockers: string[] = [];
  const lostToSubscription = entitlements.filter((e) => e.source === "blocked_by_subscription_status");
  if (lostToSubscription.length > 0) {
    blockers.push(`assinatura "${input.subscription.status}" — ${lostToSubscription.length} módulo(s) sem autorização: ${lostToSubscription.map((e) => e.moduleId).join(", ")}`);
  }
  const restrictedCore = entitlements.filter((e) => e.restricted);
  if (restrictedCore.length > 0) {
    warnings.push(`${restrictedCore.length} módulo(s) core em modo restrito por inadimplência — dados preservados, sem suspensão real executada`);
  }

  return {
    entitlements,
    authorizedModules,
    unauthorizedModules,
    includedModules,
    extraModules,
    blockedByModuleEngine,
    limits: input.billingPlan.limits,
    warnings,
    blockers,
  };
}
