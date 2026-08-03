/**
 * Executor abstrato do Brighter Provisioning Engine — Foundation v1.
 *
 * `ProvisioningAdapter` é a interface (ver `lib/provisioning/types.ts`).
 * Nesta Foundation só existem adaptadores FAKE: `NoopProvisioningAdapter`
 * (não faz nada, sempre "sucesso") e `InMemoryProvisioningAdapter`
 * (configurável pra teste — decide sucesso/falha por `stepId`). Nenhum dos
 * dois toca rede, banco, VPS, DNS ou Docker. Adaptadores reais ficam pra uma
 * fase futura.
 *
 * `executeProvisioningPlan` respeita dependências (nunca roda etapa cujos
 * `dependsOn` não estão todos `"completed"`), nunca reexecuta etapa
 * `"completed"` (idempotência), nunca roda etapa `"blocked"`, e pára o run
 * inteiro na primeira falha de etapa `required` ("falha crítica").
 * `simulateProvisioning` é o dry-run determinístico pedido — sempre usa
 * `InMemoryProvisioningAdapter`, nunca uma ação real.
 */
import { getProvisioningStepDefinition } from "./catalog";
import { createProvisioningLogEntry } from "./logging";
import type {
  ProvisioningAdapter,
  ProvisioningExecutionContext,
  ProvisioningLogEntry,
  ProvisioningPlan,
  ProvisioningStepResult,
} from "./types";

export class NoopProvisioningAdapter implements ProvisioningAdapter {
  supports(): boolean {
    return true;
  }

  async execute(stepId: string, ctx: ProvisioningExecutionContext): Promise<ProvisioningStepResult> {
    return {
      stepId,
      status: "completed",
      message: "no-op — nenhuma ação real executada",
      logs: [
        createProvisioningLogEntry({
          ctx,
          level: "success",
          event: "noop.execute",
          message: "no-op — nenhuma ação real executada",
        }),
      ],
    };
  }

  async rollback(stepId: string, ctx: ProvisioningExecutionContext): Promise<ProvisioningStepResult> {
    return {
      stepId,
      status: "rolled_back",
      message: "no-op — nenhum rollback real executado",
      logs: [
        createProvisioningLogEntry({
          ctx,
          level: "success",
          event: "noop.rollback",
          message: "no-op — nenhum rollback real executado",
        }),
      ],
    };
  }
}

export type InMemoryProvisioningAdapterConfig = {
  /** Ids de etapa configurados pra falhar — usado só em teste/simulação. */
  failSteps?: Set<string>;
};

export class InMemoryProvisioningAdapter implements ProvisioningAdapter {
  private readonly failSteps: Set<string>;

  constructor(config: InMemoryProvisioningAdapterConfig = {}) {
    this.failSteps = config.failSteps ?? new Set();
  }

  supports(): boolean {
    return true;
  }

  async execute(stepId: string, ctx: ProvisioningExecutionContext): Promise<ProvisioningStepResult> {
    if (this.failSteps.has(stepId)) {
      return {
        stepId,
        status: "failed",
        message: "falha simulada",
        logs: [
          createProvisioningLogEntry({
            ctx,
            level: "error",
            event: "in_memory.execute.failed",
            message: `falha simulada na etapa "${stepId}"`,
          }),
        ],
      };
    }
    return {
      stepId,
      status: "completed",
      logs: [
        createProvisioningLogEntry({
          ctx,
          level: "success",
          event: "in_memory.execute.completed",
          message: `etapa "${stepId}" concluída (simulação)`,
        }),
      ],
    };
  }

  async rollback(stepId: string, ctx: ProvisioningExecutionContext): Promise<ProvisioningStepResult> {
    return {
      stepId,
      status: "rolled_back",
      logs: [
        createProvisioningLogEntry({
          ctx,
          level: "success",
          event: "in_memory.rollback.completed",
          message: `etapa "${stepId}" revertida (simulação)`,
        }),
      ],
    };
  }
}

export type ExecuteProvisioningPlanOptions = {
  /**
   * Reservado pra uso futuro com adaptadores reais — nesta Foundation todo
   * adaptador já é fake/noop, então `dryRun` não muda o comportamento, só
   * documenta a intenção de quem chama.
   */
  dryRun?: boolean;
};

export type ExecuteProvisioningPlanResult = {
  plan: ProvisioningPlan;
  logs: ProvisioningLogEntry[];
};

export async function executeProvisioningPlan(
  plan: ProvisioningPlan,
  adapter: ProvisioningAdapter,
  opts: ExecuteProvisioningPlanOptions = {},
): Promise<ExecuteProvisioningPlanResult> {
  const nextPlan: ProvisioningPlan = structuredClone(plan);
  const logs: ProvisioningLogEntry[] = [];
  void opts.dryRun;

  // Run com blockers globais nunca executa nenhuma etapa — mesmo as que
  // localmente pareceriam "ready" continuam intocadas.
  if (nextPlan.blockers.length > 0) {
    return { plan: nextPlan, logs };
  }

  nextPlan.status = "running";
  const stepById = new Map(nextPlan.steps.map((s) => [s.stepId, s]));
  let haltedByCriticalFailure = false;

  for (const stepState of nextPlan.steps) {
    if (haltedByCriticalFailure) break;
    if (stepState.status === "blocked" || stepState.status === "completed") continue;

    const def = getProvisioningStepDefinition(stepState.stepId);
    if (!def) continue; // catálogo já validado no planner — nunca deveria acontecer

    const deps = (def.dependsOn ?? []).filter((id) => stepById.has(id));
    const depsSatisfied = deps.every((id) => stepById.get(id)?.status === "completed");
    if (!depsSatisfied) continue; // ainda não é a vez desta etapa

    const ctx: ProvisioningExecutionContext = {
      runId: nextPlan.id,
      tenantId: nextPlan.tenantId,
      tenantSlug: nextPlan.tenantSlug,
      plan: nextPlan.plan,
      stepId: stepState.stepId,
    };

    stepState.status = "running";
    stepState.startedAt = new Date().toISOString();
    stepState.attempts += 1;

    const result = await adapter.execute(stepState.stepId, ctx);
    logs.push(...result.logs);
    stepState.status = result.status;
    stepState.completedAt = new Date().toISOString();

    if (result.status === "failed" && def.required) {
      haltedByCriticalFailure = true;
    }
  }

  if (haltedByCriticalFailure) {
    nextPlan.status = "failed";
  } else {
    const pendingRequired = nextPlan.steps.some((s) => {
      const def = getProvisioningStepDefinition(s.stepId);
      return Boolean(def?.required) && s.status !== "completed";
    });
    nextPlan.status = pendingRequired ? "ready" : "completed";
  }

  nextPlan.updatedAt = new Date().toISOString();
  return { plan: nextPlan, logs };
}

export type SimulateProvisioningOptions = {
  /** Ids de etapa configurados pra falhar na simulação — determinístico, sem I/O real. */
  failStepIds?: string[];
};

/** Dry-run determinístico — sempre `InMemoryProvisioningAdapter`, nunca ação real. */
export async function simulateProvisioning(
  plan: ProvisioningPlan,
  opts: SimulateProvisioningOptions = {},
): Promise<ExecuteProvisioningPlanResult> {
  const adapter = new InMemoryProvisioningAdapter({ failSteps: new Set(opts.failStepIds ?? []) });
  return executeProvisioningPlan(plan, adapter, { dryRun: true });
}
