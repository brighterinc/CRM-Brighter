/**
 * Elegibilidade de módulo — spec §9. Consolida (nunca redecide) o Module
 * Engine (precedência TÉCNICA) e o Billing (precedência FINANCEIRA, entrada
 * já resolvida por `integrations.ts::resolveMarketplaceBillingAuthorization`
 * — este arquivo nunca importa `lib/billing/*` diretamente, mesmo nível de
 * pureza de `lib/billing/entitlements.ts` em relação ao Module Engine).
 * Monitoring só pode gerar warning/bloqueio OPERACIONAL, nunca financeiro.
 */
import { getModuleDefinition, type ModuleDefinition } from "@/lib/modules/catalog";

import type {
  DeploymentPlan,
  MarketplaceEligibilityResult,
  MarketplaceModuleDefinition,
  MarketplaceRecommendedAction,
} from "./types";

export type MarketplaceBillingAuthorization = {
  authorized: boolean;
  requirement: string | null;
  blockers: string[];
  warnings: string[];
};

export type MarketplaceMonitoringHealth = {
  healthy: boolean;
  blockers: string[];
  warnings: string[];
};

export type EvaluateModuleEligibilityInput = {
  installation: { deploymentPlan: DeploymentPlan; enabledModules: string[] };
  tenantId: string;
  marketplaceModule: MarketplaceModuleDefinition;
  /** Definição técnica do Module Engine — `undefined` quando o módulo comercial referencia um `moduleId` inexistente (blocker imediato). */
  moduleDefinition?: ModuleDefinition;
  billing?: MarketplaceBillingAuthorization;
  monitoring?: MarketplaceMonitoringHealth;
  /** Ids de módulo com licença `active`/`grace_period`/`trial` já concedida a este tenant — pra checar `incompatibleModules`. */
  activeLicensedModuleIds?: string[];
};

export function evaluateModuleEligibility(input: EvaluateModuleEligibilityInput): MarketplaceEligibilityResult {
  const { installation, marketplaceModule } = input;
  const technical = input.moduleDefinition ?? getModuleDefinition(marketplaceModule.moduleId);

  const blockers: string[] = [];
  const warnings: string[] = [...(input.monitoring?.warnings ?? [])];
  let recommendedAction: MarketplaceRecommendedAction = "none";

  if (!technical) {
    blockers.push(`"${marketplaceModule.moduleId}" não existe no Module Engine — nunca pode ser licenciado`);
    return {
      moduleId: marketplaceModule.moduleId,
      eligible: false,
      blockers,
      warnings,
      requiredPlan: marketplaceModule.allowedPlans,
      requiredModules: marketplaceModule.requiredModules,
      incompatibleModules: marketplaceModule.incompatibleModules ?? [],
      billingRequirement: input.billing?.requirement ?? null,
      trialAvailable: false,
      recommendedAction: "none",
    };
  }

  // 1. Module Engine tem precedência técnica — planned nunca autorizado em produção.
  if (technical.status === "planned") {
    blockers.push(`"${marketplaceModule.moduleId}" está "planned" no Module Engine — nunca autorizado em produção`);
    recommendedAction = "wait_for_module_release";
  }

  // 2. Status comercial retired/disabled bloqueia mesmo se tecnicamente estável.
  if (marketplaceModule.status === "retired") {
    blockers.push(`"${marketplaceModule.moduleId}" está retired comercialmente — não aceita nova licença`);
  }
  if (marketplaceModule.status === "disabled" || !marketplaceModule.enabled) {
    blockers.push(`"${marketplaceModule.moduleId}" está desabilitado comercialmente`);
  }
  if (marketplaceModule.status === "deprecated") {
    warnings.push(`"${marketplaceModule.moduleId}" está deprecated — sai de venda, mas licenças existentes continuam válidas`);
  }

  // 3. Plano incompatível bloqueia.
  if (!technical.allowedPlans.includes(installation.deploymentPlan)) {
    blockers.push(`plano "${installation.deploymentPlan}" não permite "${marketplaceModule.moduleId}" (permitido em: ${technical.allowedPlans.join(", ")})`);
    if (recommendedAction === "none") recommendedAction = "upgrade_plan";
  }

  // 4. Módulo dependente ausente bloqueia (técnico + comercial).
  const missingDependencies = marketplaceModule.requiredModules.filter((id) => !installation.enabledModules.includes(id));
  if (missingDependencies.length > 0) {
    blockers.push(`dependência(s) não habilitada(s) nesta instalação: ${missingDependencies.join(", ")}`);
    if (recommendedAction === "none") recommendedAction = "resolve_dependency";
  }

  // 5. Módulo desligado operacionalmente pelo Module Engine (DISABLED_MODULES/dependência/plano) bloqueia.
  if (!installation.enabledModules.includes(marketplaceModule.moduleId) && technical.status !== "planned") {
    blockers.push(`"${marketplaceModule.moduleId}" não está habilitado tecnicamente nesta instalação (Module Engine)`);
  }

  // 6. Incompatibilidade — licença ativa de módulo incompatível nunca supera a regra técnica.
  const conflictingActive = (marketplaceModule.incompatibleModules ?? []).filter((id) => (input.activeLicensedModuleIds ?? []).includes(id));
  if (conflictingActive.length > 0) {
    blockers.push(`incompatível com módulo(s) já licenciado(s): ${conflictingActive.join(", ")}`);
    if (recommendedAction === "none") recommendedAction = "remove_conflicting_module";
  }

  // 7. Billing tem precedência financeira — só pode NEGAR.
  if (input.billing && !input.billing.authorized) {
    blockers.push(...input.billing.blockers);
    if (recommendedAction === "none") recommendedAction = input.billing.requirement ? "purchase_addon" : "regularize_billing";
  }
  warnings.push(...(input.billing?.warnings ?? []));

  // 8. Monitoring — só warning/bloqueio OPERACIONAL, nunca financeiro.
  if (input.monitoring && !input.monitoring.healthy) {
    blockers.push(...input.monitoring.blockers);
  }

  if (blockers.length === 0 && recommendedAction === "none" && marketplaceModule.trialAvailable) {
    recommendedAction = "start_trial";
  }
  if (blockers.length > 0 && recommendedAction === "none") {
    recommendedAction = "contact_sales";
  }

  return {
    moduleId: marketplaceModule.moduleId,
    eligible: blockers.length === 0,
    blockers,
    warnings,
    requiredPlan: technical.allowedPlans,
    requiredModules: marketplaceModule.requiredModules,
    incompatibleModules: marketplaceModule.incompatibleModules ?? [],
    billingRequirement: input.billing?.requirement ?? null,
    trialAvailable: marketplaceModule.trialAvailable && marketplaceModule.status !== "retired",
    recommendedAction,
  };
}
