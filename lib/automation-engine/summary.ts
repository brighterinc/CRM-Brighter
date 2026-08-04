/**
 * Resumo operacional do Brighter Automation Engine — Foundation v1.
 *
 * `generateAutomationSummary` NUNCA altera `Installation`/`WorkflowDefinition`/
 * `WorkflowRun` — produz um view model próprio pra tela admin e pro CLI.
 * Reusa `validateWorkflowDefinition` (não reimplementa a checagem de
 * entitlement) só pra agregar blockers de configuração por workflow.
 */
import type { Installation } from "@/lib/control-plane/types";

import { validateWorkflowDefinition } from "./validation";
import type { DeploymentPlan, WorkflowDefinition, WorkflowDefinitionStatus, WorkflowRun, WorkflowRunStatus } from "./types";

export type AutomationWorkflowOverview = {
  id: string;
  name: string;
  status: WorkflowDefinitionStatus;
  triggerId: string;
  stepCount: number;
};

export type AutomationRunOverview = {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  createdAt: string;
};

export type AutomationOperationalSummary = {
  installationId: string;
  slug: string;
  company: string;
  plan: DeploymentPlan;
  totalWorkflows: number;
  activeWorkflows: number;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  waitingRuns: number;
  skippedDuplicateRuns: number;
  workflows: AutomationWorkflowOverview[];
  recentRuns: AutomationRunOverview[];
  blockers: string[];
  warnings: string[];
  generatedAt: string;
};

function countByStatus(runs: WorkflowRun[], status: WorkflowRunStatus): number {
  return runs.filter((r) => r.status === status).length;
}

/** Resumo (JSON) de UMA instalação a partir de seus workflows + runs já resolvidos. */
export function generateAutomationSummary(
  installation: Installation,
  workflows: WorkflowDefinition[],
  runs: WorkflowRun[],
): AutomationOperationalSummary {
  const blockers: string[] = [];
  for (const workflow of workflows) {
    const errors = validateWorkflowDefinition({
      workflow,
      enabledModuleIds: installation.modules,
      deploymentPlan: installation.deploymentPlan,
    });
    for (const e of errors) blockers.push(`workflow "${workflow.name}" (${e.field}): ${e.message}`);
  }

  const recentRuns = [...runs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)
    .map((r) => ({ id: r.id, workflowId: r.workflowId, status: r.status, createdAt: r.createdAt }));

  return {
    installationId: installation.id,
    slug: installation.slug,
    company: installation.company,
    plan: installation.deploymentPlan,
    totalWorkflows: workflows.length,
    activeWorkflows: workflows.filter((w) => w.status === "active").length,
    totalRuns: runs.length,
    completedRuns: countByStatus(runs, "completed"),
    failedRuns: countByStatus(runs, "failed"),
    waitingRuns: countByStatus(runs, "waiting") + countByStatus(runs, "queued") + countByStatus(runs, "running"),
    skippedDuplicateRuns: countByStatus(runs, "skipped_duplicate"),
    workflows: workflows.map((w) => ({ id: w.id, name: w.name, status: w.status, triggerId: w.triggerId, stepCount: w.steps.length })),
    recentRuns,
    blockers,
    warnings: [],
    generatedAt: new Date().toISOString(),
  };
}

/** Renderiza `generateAutomationSummary` como Markdown — usado pela CLI e pela tela admin. */
export function renderAutomationSummaryMarkdown(summary: AutomationOperationalSummary): string {
  const lines: string[] = [
    `# Automação — ${summary.company} (${summary.slug})`,
    "",
    `- Plano: ${summary.plan}`,
    `- Workflows: ${summary.totalWorkflows} (ativos: ${summary.activeWorkflows})`,
    `- Runs: ${summary.totalRuns} (concluídos: ${summary.completedRuns}, falhos: ${summary.failedRuns}, em andamento/espera: ${summary.waitingRuns}, dedupe por idempotência: ${summary.skippedDuplicateRuns})`,
    "",
    "## Workflows",
    ...(summary.workflows.length > 0
      ? summary.workflows.map((w) => `- **${w.name}** (\`${w.id}\`) — status: ${w.status}, gatilho: ${w.triggerId}, etapas: ${w.stepCount}`)
      : ["- Nenhum workflow configurado."]),
    "",
    "## Runs recentes",
    ...(summary.recentRuns.length > 0
      ? summary.recentRuns.map((r) => `- \`${r.id}\` — workflow \`${r.workflowId}\`, status: ${r.status}, criado em ${r.createdAt}`)
      : ["- Nenhum run ainda."]),
    "",
    "## Blockers de configuração",
    ...(summary.blockers.length > 0 ? summary.blockers.map((b) => `- ${b}`) : ["- Nenhum — todos os workflows autorizados."]),
  ];
  return lines.join("\n") + "\n";
}
