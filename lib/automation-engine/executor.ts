/**
 * Executor abstrato do Brighter Automation Engine — Foundation v1.
 *
 * `WorkflowActionAdapter` é a interface (`types.ts`). Nesta Foundation só
 * existem adaptadores FAKE: `NoopWorkflowActionAdapter` (não faz nada,
 * sempre "sucesso") e `InMemoryWorkflowActionAdapter` (configurável por
 * teste — decide sucesso/falha por `stepId`). Nenhum dos dois toca rede,
 * banco, WhatsApp ou webhook real. Adaptador real (que de fato chamasse
 * `lib/automation/actions/*`) fica pra uma fase futura ("Automation
 * Adapters Foundation" — ver ROADMAP.md, mesmo padrão da "Provisioning
 * Adapters Foundation").
 *
 * Diferente de `executeProvisioningPlan` (grafo `dependsOn` executado em
 * lote a cada chamada): um `WorkflowRun` tem ramificação (`onSuccess`/
 * `onFailure`), então `executeWorkflowRun` caminha UMA etapa de cada vez a
 * partir de `run.currentStepId`, e PÁRA (devolve `status: "waiting"`) assim
 * que encontra uma etapa em delay ou aguardando retry — nunca com
 * `setTimeout`/sleep real. `nextAttemptAt` é só um carimbo ISO; quem chama
 * de novo com um `now` mais tarde (produção futura: um cron; nesta
 * Foundation: o próprio teste/CLI) é quem "avança o relógio".
 *
 * Idempotência de etapa: uma etapa `"completed"` NUNCA reexecuta — o loop
 * pára e falha em vez de reprocessar (ver guard no topo do laço).
 * Idempotência de RUN (gatilho duplicado) já foi resolvida em
 * `planner.ts` (`generateWorkflowRun` devolve `"skipped_duplicate"` antes
 * de chegar aqui).
 */
import { createWorkflowHistoryEntry } from "./history";
import type {
  WorkflowActionAdapter,
  WorkflowActionContext,
  WorkflowActionResult,
  WorkflowDefinition,
  WorkflowHistoryEntry,
  WorkflowRun,
} from "./types";

export class NoopWorkflowActionAdapter implements WorkflowActionAdapter {
  supports(): boolean {
    return true;
  }

  async execute(actionId: string, ctx: WorkflowActionContext): Promise<WorkflowActionResult> {
    return {
      stepId: ctx.stepId,
      status: "success",
      message: `no-op — nenhuma ação real executada para "${actionId}"`,
    };
  }
}

export type InMemoryWorkflowActionAdapterConfig = {
  /** Ids de ETAPA (não de ação) configurados pra falhar SEMPRE — usado só em teste/simulação. */
  failStepIds?: Set<string>;
  /** Ids de etapa configurados pra devolver "skipped" — usado só em teste/simulação. */
  skipStepIds?: Set<string>;
  /**
   * Etapa falha nas N primeiras chamadas e sucede a partir da (N+1)-ésima —
   * simula "resolve depois de retry" de forma determinística (contador
   * interno, nunca aleatório). Usado só em teste/simulação.
   */
  failFirstAttempts?: Map<string, number>;
};

export class InMemoryWorkflowActionAdapter implements WorkflowActionAdapter {
  private readonly failStepIds: Set<string>;
  private readonly skipStepIds: Set<string>;
  private readonly remainingFailures: Map<string, number>;

  constructor(config: InMemoryWorkflowActionAdapterConfig = {}) {
    this.failStepIds = config.failStepIds ?? new Set();
    this.skipStepIds = config.skipStepIds ?? new Set();
    this.remainingFailures = new Map(config.failFirstAttempts ?? []);
  }

  supports(): boolean {
    return true;
  }

  async execute(actionId: string, ctx: WorkflowActionContext): Promise<WorkflowActionResult> {
    if (this.failStepIds.has(ctx.stepId)) {
      return { stepId: ctx.stepId, status: "failed", message: "falha simulada" };
    }
    const remaining = this.remainingFailures.get(ctx.stepId) ?? 0;
    if (remaining > 0) {
      this.remainingFailures.set(ctx.stepId, remaining - 1);
      return { stepId: ctx.stepId, status: "failed", message: `falha simulada (${remaining} restante(s) antes de suceder)` };
    }
    if (this.skipStepIds.has(ctx.stepId)) {
      return { stepId: ctx.stepId, status: "skipped", message: "skip simulado" };
    }
    return { stepId: ctx.stepId, status: "success", message: `ação "${actionId}" concluída (simulação)` };
  }
}

export type ExecuteWorkflowRunOptions = {
  /** Relógio virtual — nunca `Date.now()` implícito dentro do laço, pra permitir avanço determinístico em teste/simulação. */
  now?: Date;
};

export type ExecuteWorkflowRunResult = {
  run: WorkflowRun;
  history: WorkflowHistoryEntry[];
};

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled", "skipped_duplicate"]);

export async function executeWorkflowRun(
  run: WorkflowRun,
  workflow: WorkflowDefinition,
  adapter: WorkflowActionAdapter,
  opts: ExecuteWorkflowRunOptions = {},
): Promise<ExecuteWorkflowRunResult> {
  const now = opts.now ?? new Date();
  const nextRun: WorkflowRun = structuredClone(run);
  const newHistory: WorkflowHistoryEntry[] = [];

  if (TERMINAL_RUN_STATUSES.has(nextRun.status)) {
    return { run: nextRun, history: newHistory };
  }

  const stepDefById = new Map(workflow.steps.map((s) => [s.id, s]));
  const stepStateById = new Map(nextRun.steps.map((s) => [s.stepId, s]));

  function log(level: WorkflowHistoryEntry["level"], event: string, message: string, stepId?: string): void {
    const entry = createWorkflowHistoryEntry({ runId: nextRun.id, workflowId: nextRun.workflowId, stepId, level, event, message });
    nextRun.history.push(entry);
    newHistory.push(entry);
  }

  nextRun.status = "running";
  let currentStepId: string | undefined = nextRun.currentStepId ?? workflow.entryStepId;
  let finalOutcome: "completed" | "failed" | undefined;

  while (currentStepId) {
    const stepDef = stepDefById.get(currentStepId);
    const stepState = stepStateById.get(currentStepId);
    if (!stepDef || !stepState) {
      log("error", "run.dangling_step", `etapa "${currentStepId}" referenciada, mas ausente na definição/estado — run interrompido`);
      nextRun.status = "failed";
      nextRun.currentStepId = currentStepId;
      break;
    }

    // Idempotência de etapa: uma etapa já concluída NUNCA reexecuta.
    if (stepState.status === "completed") {
      log("error", "run.step_already_completed", `etapa "${currentStepId}" já estava concluída — reexecução bloqueada`, currentStepId);
      nextRun.status = "failed";
      nextRun.currentStepId = currentStepId;
      break;
    }

    // Delay ainda não aplicado nesta etapa: aplica e pára (nunca sleep real).
    if (stepDef.delaySeconds && stepState.status !== "waiting_delay" && stepState.status !== "retrying") {
      stepState.status = "waiting_delay";
      stepState.nextAttemptAt = new Date(now.getTime() + stepDef.delaySeconds * 1000).toISOString();
      log("info", "step.delayed", `etapa "${currentStepId}" aguardando ${stepDef.delaySeconds}s (delay configurado)`, currentStepId);
      nextRun.status = "waiting";
      nextRun.currentStepId = currentStepId;
      break;
    }

    // Delay/retry agendados mas ainda não venceram: pára aqui, sem avançar o relógio.
    if ((stepState.status === "waiting_delay" || stepState.status === "retrying") && stepState.nextAttemptAt) {
      if (new Date(stepState.nextAttemptAt).getTime() > now.getTime()) {
        nextRun.status = "waiting";
        nextRun.currentStepId = currentStepId;
        break;
      }
    }

    stepState.status = "running";
    stepState.attempts += 1;
    if (!stepState.startedAt) stepState.startedAt = now.toISOString();

    const ctx: WorkflowActionContext = {
      runId: nextRun.id,
      workflowId: nextRun.workflowId,
      installationId: nextRun.installationId,
      stepId: currentStepId,
      triggerPayload: {},
    };

    const result = await adapter.execute(stepDef.actionId, ctx, stepDef.config);

    if (result.status === "success" || result.status === "skipped") {
      stepState.status = result.status === "success" ? "completed" : "skipped";
      stepState.completedAt = now.toISOString();
      log("success", `step.${result.status}`, result.message ?? `etapa "${currentStepId}" ${result.status}`, currentStepId);
      if (!stepDef.onSuccess) finalOutcome = "completed";
      currentStepId = stepDef.onSuccess;
      continue;
    }

    // result.status === "failed"
    const retry = stepDef.retry;
    if (retry && stepState.attempts < retry.maxAttempts) {
      stepState.status = "retrying";
      stepState.nextAttemptAt = new Date(now.getTime() + retry.backoffSeconds * 1000).toISOString();
      stepState.lastError = result.message;
      log(
        "warning",
        "step.retry_scheduled",
        `etapa "${currentStepId}" falhou (tentativa ${stepState.attempts}/${retry.maxAttempts}) — nova tentativa em ${retry.backoffSeconds}s`,
        currentStepId,
      );
      nextRun.status = "waiting";
      nextRun.currentStepId = currentStepId;
      break;
    }

    stepState.status = "failed";
    stepState.completedAt = now.toISOString();
    stepState.lastError = result.message;
    log("error", "step.failed", result.message ?? `etapa "${currentStepId}" falhou`, currentStepId);
    if (!stepDef.onFailure) finalOutcome = "failed";
    currentStepId = stepDef.onFailure;
  }

  if (nextRun.status === "running") {
    // Loop terminou sem ramo seguinte (currentStepId undefined) — run concluído.
    // `finalOutcome` foi decidido no ponto exato em que o grafo não teve mais
    // pra onde ir (nunca reconstruído por varredura pós-laço).
    nextRun.status = finalOutcome ?? "completed";
    nextRun.currentStepId = undefined;
    log(
      "success",
      nextRun.status === "completed" ? "run.completed" : "run.failed",
      nextRun.status === "completed" ? "run concluído com sucesso" : "run concluído com falha não tratada (sem onFailure)",
    );
  }

  nextRun.updatedAt = now.toISOString();
  return { run: nextRun, history: newHistory };
}
