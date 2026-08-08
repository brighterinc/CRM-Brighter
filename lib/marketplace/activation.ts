/**
 * `generateModuleActivationPlan` — spec §11. Produz um plano TEÓRICO — nunca
 * ativa módulo, nunca edita `.env`, nunca altera o Module Engine, nunca faz
 * deploy, nunca reinicia serviço. `requiredEnvironmentVariables` são só
 * NOMES (`ENABLED_MODULES`/`DISABLED_MODULES`, mesma convenção de
 * `lib/deployment/env-template.ts` — nunca valor).
 */
import type { ModuleDefinition, ModuleInfraRequirements } from "@/lib/modules/catalog";

import type {
  DeploymentPlan,
  MarketplaceEligibilityResult,
  MarketplaceModuleDefinition,
  ModuleActivationDesiredState,
  ModuleActivationPlan,
} from "./types";

const INFRA_STEP_LABEL: Record<keyof ModuleInfraRequirements, string> = {
  database: "Confirmar schema/migration necessária no Postgres",
  auth: "Confirmar policy de RLS/RBAC associada ao módulo",
  storage: "Confirmar bucket do Supabase Storage necessário",
  edgeFunctions: "Publicar/atualizar Edge Function associada",
  redis: "Confirmar disponibilidade do Redis (Upstash) na instalação",
  worker: "Confirmar worker (`event_log`/cron) rodando pra esta instalação",
  scheduler: "Confirmar scheduler configurado (cron)",
  whatsapp: "Confirmar conexão WAHA ativa (engine NOWEB) — exige VPS Dedicated",
  email: "Confirmar provedor de e-mail transacional configurado",
  ai: "Confirmar credencial do AI Gateway configurada",
};

export type GenerateModuleActivationPlanInput = {
  installation: { deploymentPlan: DeploymentPlan; enabledModules: string[] };
  marketplaceModule: MarketplaceModuleDefinition;
  moduleDefinition?: ModuleDefinition;
  eligibility: MarketplaceEligibilityResult;
  desiredState: ModuleActivationDesiredState;
};

export function generateModuleActivationPlan(input: GenerateModuleActivationPlanInput): ModuleActivationPlan {
  const { installation, marketplaceModule, moduleDefinition, eligibility, desiredState } = input;
  const currentState: "enabled" | "disabled" = installation.enabledModules.includes(marketplaceModule.moduleId) ? "enabled" : "disabled";

  const prerequisites: string[] = [];
  const blockers = [...eligibility.blockers];
  const warnings = [...eligibility.warnings];
  const provisioningSteps: string[] = [];
  const requiredEnvironmentVariables: string[] = [];

  if (desiredState === "activated") {
    prerequisites.push(...marketplaceModule.requiredModules.map((id) => `módulo "${id}" habilitado`));
    if (!eligibility.eligible) {
      blockers.push(`elegibilidade negativa — plano de ativação bloqueado até resolver os itens acima`);
    }

    requiredEnvironmentVariables.push("ENABLED_MODULES");
    provisioningSteps.push(`Adicionar "${marketplaceModule.moduleId}" a ENABLED_MODULES (nome da variável — nunca valor real nesta Foundation)`);

    for (const [flag, required] of Object.entries(moduleDefinition?.requires ?? {}) as [keyof ModuleInfraRequirements, boolean | undefined][]) {
      if (required) provisioningSteps.push(INFRA_STEP_LABEL[flag]);
    }
  } else {
    provisioningSteps.push(`Adicionar "${marketplaceModule.moduleId}" a DISABLED_MODULES (nome da variável — nunca valor real nesta Foundation)`);
    requiredEnvironmentVariables.push("DISABLED_MODULES");
    if (currentState === "enabled") {
      warnings.push(`desativar "${marketplaceModule.moduleId}" não remove dado já existente — só impede acesso via rota protegida (requireModule)`);
    }
  }

  const requiresRestart = Boolean(moduleDefinition?.requires.worker || moduleDefinition?.requires.scheduler);
  const requiresDeploy = installation.deploymentPlan === "dedicated" && Boolean(moduleDefinition?.requires.whatsapp || moduleDefinition?.requires.edgeFunctions);

  const requiredBillingState = eligibility.billingRequirement;

  let recommendation: string;
  if (desiredState === "activated") {
    recommendation = blockers.length > 0 ? `bloqueado — resolver ${blockers.length} item(ns) antes de reenviar o plano` : `pronto pra ativação — nenhuma etapa real será executada nesta Foundation`;
  } else {
    recommendation = `pronto pra desativação — dados preservados, reversível a qualquer momento`;
  }

  return {
    moduleId: marketplaceModule.moduleId,
    currentState,
    desiredState,
    prerequisites,
    blockers,
    warnings,
    provisioningSteps,
    requiredEnvironmentVariables,
    requiredBillingState,
    requiresRestart,
    requiresDeploy,
    // Nunca cria/destrói infraestrutura de verdade nesta Foundation — toggling de env var é sempre reversível.
    reversible: true,
    recommendation,
  };
}
