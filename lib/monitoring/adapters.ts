/**
 * Adaptadores abstratos do Monitoring Engine — Foundation v1.
 *
 * `MonitoringAdapter` é a interface (mesma forma de `ProvisioningAdapter`,
 * ver `lib/provisioning/types.ts`/`executor.ts`). Nesta Foundation só
 * existem adaptadores FAKE/NOOP — nenhum toca rede, DNS, SSL, Supabase,
 * Vercel, VPS, Docker, Redis, WAHA, Chatwoot ou Evolution. Adaptadores reais
 * ficam pra uma fase futura (ver ROADMAP.md).
 */
import type { MonitoringCheckResult, MonitoringCheckStatus, DeploymentPlan } from "./types";

/** Contexto mínimo passado a um `MonitoringAdapter` — deliberadamente sem `Tenant`/`Installation` completos. */
export type MonitoringCheckExecutionContext = {
  installationId: string;
  tenantId: string;
  plan: DeploymentPlan;
  checkId: string;
};

export type MonitoringAdapter = {
  supports(checkId: string): boolean;
  execute(ctx: MonitoringCheckExecutionContext): Promise<MonitoringCheckResult>;
};

/**
 * Nunca finge sucesso: um check "no-op" nesta Foundation não tem como saber
 * se está saudável de verdade, então retorna sempre `"skipped"` (que o
 * evaluator NUNCA conta como sucesso — ver `status.ts::NON_SUCCESS_CHECK_STATUSES`).
 */
export class NoopMonitoringAdapter implements MonitoringAdapter {
  supports(): boolean {
    return true;
  }

  async execute(ctx: MonitoringCheckExecutionContext): Promise<MonitoringCheckResult> {
    return {
      checkId: ctx.checkId,
      status: "skipped",
      observedAt: new Date().toISOString(),
      message: "no-op — nenhum check real executado nesta Foundation",
    };
  }
}

export type InMemoryMonitoringAdapterConfig = {
  /** Resultado (parcial) configurado por checkId — usado só em teste/simulação. */
  results?: Map<string, Partial<MonitoringCheckResult>>;
  /** Status usado quando `checkId` não tem entrada em `results`. */
  defaultStatus?: MonitoringCheckStatus;
};

/** Adaptador determinístico e configurável — decide status por `checkId`, nunca I/O real. */
export class InMemoryMonitoringAdapter implements MonitoringAdapter {
  protected readonly results: Map<string, Partial<MonitoringCheckResult>>;
  protected readonly defaultStatus: MonitoringCheckStatus;

  constructor(config: InMemoryMonitoringAdapterConfig = {}) {
    this.results = config.results ?? new Map();
    this.defaultStatus = config.defaultStatus ?? "healthy";
  }

  supports(): boolean {
    return true;
  }

  async execute(ctx: MonitoringCheckExecutionContext): Promise<MonitoringCheckResult> {
    const configured = this.results.get(ctx.checkId);
    const status = configured?.status ?? this.defaultStatus;
    return {
      checkId: ctx.checkId,
      status,
      observedAt: configured?.observedAt ?? new Date().toISOString(),
      durationMs: configured?.durationMs,
      message: configured?.message ?? `check "${ctx.checkId}" simulado como "${status}"`,
      metadata: configured?.metadata,
      nextRecommendedAction: configured?.nextRecommendedAction,
    };
  }
}

/**
 * Mesma implementação de `InMemoryMonitoringAdapter` — nome dedicado pra uso
 * explícito em testes (doutrina anti-duplicação, CLAUDE.md anti-pattern #2:
 * duas classes com a mesma lógica seriam uma duplicata não declarada).
 */
export class FakeMonitoringAdapter extends InMemoryMonitoringAdapter {}
