/**
 * Resumo operacional do Brighter Provisioning Engine — função pura que
 * combina um `ProvisioningPlan` (e, opcionalmente, o `DeploymentManifest` de
 * origem) em algo pronto pra tela/CLI. Sem I/O, sem segredo — `manifest` só
 * expõe nomes de variável (`DeploymentEnvironment` já garante isso) e flags
 * de infraestrutura, nunca valor.
 */
import type { DeploymentInfrastructure } from "@/lib/deployment";

import { getProvisioningStepDefinition } from "./catalog";
import { buildRollbackPlan } from "./rollback";
import type { DeploymentManifest, ProvisioningPlan } from "./types";

export type ProvisioningSummary = {
  planId: string;
  tenantSlug: string;
  plan: ProvisioningPlan["plan"];
  target: ProvisioningPlan["target"];
  status: ProvisioningPlan["status"];
  fingerprint: string;
  totalSteps: number;
  readySteps: number;
  pendingSteps: number;
  blockedSteps: number;
  completedSteps: number;
  failedSteps: number;
  rollbackAvailable: number;
  blockers: string[];
  warnings: string[];
  infrastructure: Partial<DeploymentInfrastructure> | null;
  pendingEnvironmentVariables: { required: string[]; optional: string[] } | null;
  estimatedEffort: string;
  recommendedNextStep: string;
};

const CATEGORY_TO_INFRA: Partial<Record<string, keyof DeploymentInfrastructure>> = {
  database: "database",
  authentication: "auth",
  storage: "storage",
  whatsapp: "whatsapp",
  email: "email",
  ai: "ai",
};

function inferInfrastructureFromSteps(plan: ProvisioningPlan): Partial<DeploymentInfrastructure> {
  const infra: Partial<DeploymentInfrastructure> = {
    vpsRequired: plan.steps.some((s) => s.stepId === "prepare_vps"),
    docker: plan.steps.some((s) => s.stepId === "install_runtime"),
    proxy: plan.steps.some((s) => s.stepId === "configure_reverse_proxy"),
  };
  for (const s of plan.steps) {
    const def = getProvisioningStepDefinition(s.stepId);
    const infraKey = def && CATEGORY_TO_INFRA[def.category];
    if (infraKey) infra[infraKey] = true;
  }
  return infra;
}

function estimateEffort(plan: ProvisioningPlan): string {
  if (plan.plan === "dedicated") {
    return "moderado a alto — inclui provisionamento de VPS, proxy reverso, Redis, worker e scheduler";
  }
  if (plan.plan === "pro") {
    return "rápido a moderado — frontend e banco gerenciados, com automações leves";
  }
  return "rápido — frontend e banco gerenciados, sem VPS";
}

function recommendNextStep(plan: ProvisioningPlan): string {
  if (plan.blockers.length > 0) {
    return `Resolver bloqueio: ${plan.blockers[0]}`;
  }
  const nextReady = plan.steps.find((s) => s.status === "ready");
  if (nextReady) {
    const def = getProvisioningStepDefinition(nextReady.stepId);
    return `Executar etapa: ${def?.name ?? nextReady.stepId}`;
  }
  const allCompleted = plan.steps.every((s) => s.status === "completed" || s.status === "blocked");
  if (allCompleted && plan.steps.some((s) => s.status === "completed")) {
    return "Nenhuma ação necessária — plano concluído";
  }
  return "Nenhuma etapa pronta no momento";
}

export function generateProvisioningSummary(
  plan: ProvisioningPlan,
  manifest?: DeploymentManifest,
): ProvisioningSummary {
  const countByStatus = (status: string) => plan.steps.filter((s) => s.status === status).length;

  return {
    planId: plan.id,
    tenantSlug: plan.tenantSlug,
    plan: plan.plan,
    target: plan.target,
    status: plan.status,
    fingerprint: plan.manifestFingerprint,
    totalSteps: plan.steps.length,
    readySteps: countByStatus("ready"),
    pendingSteps: countByStatus("pending"),
    blockedSteps: countByStatus("blocked"),
    completedSteps: countByStatus("completed"),
    failedSteps: countByStatus("failed"),
    rollbackAvailable: buildRollbackPlan(plan).length,
    blockers: plan.blockers,
    warnings: plan.warnings,
    infrastructure: manifest ? manifest.infrastructure : inferInfrastructureFromSteps(plan),
    pendingEnvironmentVariables: manifest
      ? { required: manifest.environment.required, optional: manifest.environment.optional }
      : null,
    estimatedEffort: estimateEffort(plan),
    recommendedNextStep: recommendNextStep(plan),
  };
}

export function renderProvisioningSummaryMarkdown(summary: ProvisioningSummary): string {
  const lines: string[] = [
    `# Plano de provisionamento — ${summary.tenantSlug}`,
    "",
    `- **Plano:** ${summary.plan}`,
    `- **Target:** ${summary.target}`,
    `- **Status:** ${summary.status}`,
    `- **Fingerprint:** \`${summary.fingerprint}\``,
    `- **Esforço estimado:** ${summary.estimatedEffort}`,
    `- **Próximo passo recomendado:** ${summary.recommendedNextStep}`,
    "",
    `## Etapas (${summary.totalSteps})`,
    `- Prontas: ${summary.readySteps}`,
    `- Pendentes: ${summary.pendingSteps}`,
    `- Bloqueadas: ${summary.blockedSteps}`,
    `- Concluídas: ${summary.completedSteps}`,
    `- Falhas: ${summary.failedSteps}`,
    `- Rollback disponível: ${summary.rollbackAvailable} etapa(s)`,
  ];

  if (summary.pendingEnvironmentVariables) {
    lines.push(
      "",
      "## Variáveis pendentes (só nomes)",
      "### Obrigatórias",
      ...summary.pendingEnvironmentVariables.required.map((name) => `- \`${name}\``),
      "### Opcionais",
      ...summary.pendingEnvironmentVariables.optional.map((name) => `- \`${name}\``),
    );
  }

  if (summary.warnings.length > 0) {
    lines.push("", "## Avisos", ...summary.warnings.map((w) => `- ${w}`));
  }
  if (summary.blockers.length > 0) {
    lines.push("", "## Bloqueios", ...summary.blockers.map((b) => `- ${b}`));
  }

  return lines.join("\n") + "\n";
}
