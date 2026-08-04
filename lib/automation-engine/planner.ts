/**
 * `generateWorkflowRun` — coração do Brighter Automation Engine (Foundation
 * v1). Função pura: recebe um `WorkflowDefinition` + o payload do gatilho e
 * devolve um `WorkflowRun` em `"queued"` (ou já `"failed"`/
 * `"skipped_duplicate"`, se a validação ou a idempotência barrarem antes de
 * qualquer etapa rodar). NÃO lê `process.env`, NÃO persiste, NÃO executa
 * nenhuma ação — isso é `executor.ts`.
 *
 * Diferente do `ProvisioningPlan` (grafo `dependsOn` pré-ordenado no
 * planner): um `WorkflowRun` tem ramificação (`onSuccess`/`onFailure`), então
 * a ordem de execução não é conhecida de antemão — só a etapa de entrada
 * (`entryStepId`). Por isso todo `WorkflowStepRunState` nasce `"pending"`
 * exceto o de entrada, que nasce `"ready"`; `executor.ts` decide a próxima
 * etapa dinamicamente a cada resultado.
 */
import { createHash } from "node:crypto";

import { createWorkflowHistoryEntry } from "./history";
import { validateWorkflowDefinition } from "./validation";
import type { WorkflowDefinition, WorkflowRun, WorkflowStepRunState } from "./types";

/**
 * Só campos NÃO sensíveis do payload do gatilho entram no fingerprint — o
 * chamador é responsável por nunca passar segredo em `triggerPayload`
 * (mesma responsabilidade que `sanitizeDeep` cobre pro `history`, ver
 * `sanitization.ts`). Mesmo `workflowId` + mesmo payload (mesma ordem de
 * chaves não importa — `JSON.stringify` de objeto com chaves ordenadas)
 * sempre gera o mesmo fingerprint.
 */
export function calculateTriggerFingerprint(input: {
  workflowId: string;
  triggerPayload: Record<string, unknown>;
}): string {
  const sortedPayload = Object.fromEntries(Object.entries(input.triggerPayload).sort(([a], [b]) => a.localeCompare(b)));
  const stable = { workflowId: input.workflowId, payload: sortedPayload };
  const hash = createHash("sha256").update(JSON.stringify(stable)).digest("hex");
  return `wf_${hash.slice(0, 16)}`;
}

function historyEntry(
  run: Pick<WorkflowRun, "id" | "workflowId">,
  level: Parameters<typeof createWorkflowHistoryEntry>[0]["level"],
  event: string,
  message: string,
) {
  return createWorkflowHistoryEntry({ runId: run.id, workflowId: run.workflowId, level, event, message });
}

export type GenerateWorkflowRunInput = {
  workflow: WorkflowDefinition;
  triggerPayload: Record<string, unknown>;
  enabledModuleIds: string[];
  deploymentPlan: string;
  /**
   * Runs já existentes pro mesmo workflow — usado só pra checar idempotência
   * (fingerprint duplicado entre runs `"queued"`/`"running"`/`"completed"`).
   * Nunca persistido aqui — quem chama decide se salva no repositório.
   */
  existingRuns?: WorkflowRun[];
};

const DUPLICATE_BLOCKING_STATUSES = new Set(["queued", "running", "waiting", "completed"]);

export function generateWorkflowRun(input: GenerateWorkflowRunInput): WorkflowRun {
  const { workflow, triggerPayload, enabledModuleIds, deploymentPlan, existingRuns = [] } = input;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const fingerprint = calculateTriggerFingerprint({ workflowId: workflow.id, triggerPayload });

  const base: Omit<WorkflowRun, "status" | "steps" | "history"> = {
    id,
    workflowId: workflow.id,
    installationId: workflow.installationId,
    triggerFingerprint: fingerprint,
    createdAt: now,
    updatedAt: now,
  };

  if (workflow.status !== "active") {
    return {
      ...base,
      status: "cancelled",
      steps: [],
      history: [historyEntry(base, "warning", "run.cancelled", `workflow "${workflow.id}" não está ativo (status: "${workflow.status}")`)],
    };
  }

  const validationErrors = validateWorkflowDefinition({ workflow, enabledModuleIds, deploymentPlan });
  if (validationErrors.length > 0) {
    return {
      ...base,
      status: "failed",
      steps: [],
      history: [
        historyEntry(
          base,
          "error",
          "run.validation_failed",
          `workflow inválido: ${validationErrors.map((e) => `${e.field}: ${e.message}`).join("; ")}`,
        ),
      ],
    };
  }

  const isDuplicate = existingRuns.some(
    (r) => r.workflowId === workflow.id && r.triggerFingerprint === fingerprint && DUPLICATE_BLOCKING_STATUSES.has(r.status),
  );
  if (isDuplicate) {
    return {
      ...base,
      status: "skipped_duplicate",
      steps: [],
      history: [
        historyEntry(base, "info", "run.skipped_duplicate", `fingerprint "${fingerprint}" já tem um run em andamento/concluído — idempotência aplicada`),
      ],
    };
  }

  const steps: WorkflowStepRunState[] = workflow.steps.map((s) => ({
    stepId: s.id,
    status: s.id === workflow.entryStepId ? "ready" : "pending",
    attempts: 0,
  }));

  return {
    ...base,
    status: "queued",
    steps,
    history: [historyEntry(base, "info", "run.queued", `run enfileirado a partir da etapa de entrada "${workflow.entryStepId}"`)],
  };
}
