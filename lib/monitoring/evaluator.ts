/**
 * Motor de avaliação do Monitoring Engine — Foundation v1.
 *
 * `resolveApplicableMonitoringChecks` e `evaluateMonitoringSnapshot`
 * recebem SEMPRE uma `Installation` inteira (`lib/control-plane/types.ts`),
 * nunca `tenant`/`manifest`/`provisioningPlan` soltos — `Installation` já É
 * a agregação dos três (mesma doutrina que impede a Control Plane de
 * aceitar esses campos como input independente em
 * `lib/control-plane/repository.ts`). Nada aqui chama rede, DNS, SSL,
 * Supabase, VPS, Docker, Redis, WAHA, Chatwoot ou Evolution — `results` é
 * sempre dado de entrada (de um `MonitoringAdapter` fake/noop ou de
 * `simulateMonitoringRun`).
 */
import type { Installation } from "@/lib/control-plane/types";

import { MONITORING_CHECK_CATALOG } from "./catalog";
import { CHECK_CADENCE_GRACE_MS, MONITORING_SEVERITY_WEIGHT } from "./status";
import type {
  MonitoringCategory,
  MonitoringCheckDefinition,
  MonitoringCheckResult,
  MonitoringCheckStatus,
  MonitoringSnapshot,
} from "./types";

/** Checks do catálogo aplicáveis a ESTA instalação — plano, módulos habilitados e infra do manifesto. */
export function resolveApplicableMonitoringChecks(installation: Installation): MonitoringCheckDefinition[] {
  return MONITORING_CHECK_CATALOG.filter((def) => {
    if (!def.enabledByDefault) return false;
    if (!def.appliesToPlans.includes(installation.deploymentPlan)) return false;
    if (def.requiredModules && !def.requiredModules.every((id) => installation.modules.includes(id))) return false;
    if (
      def.requiresInfra &&
      !def.requiresInfra.every((key) => Boolean(installation.deployment.infrastructure[key]))
    ) {
      return false;
    }
    return true;
  });
}

const CATEGORY_FALLBACK_ACTION: Partial<Record<MonitoringCategory, string>> = {
  dns: "Verifique os registros DNS do domínio.",
  ssl: "Verifique/renove o certificado SSL.",
  database: "Verifique a disponibilidade do banco de dados.",
  redis: "Verifique o serviço Redis.",
  worker: "Verifique o worker dedicado.",
  scheduler: "Verifique o scheduler dedicado.",
  backup: "Verifique o job de backup mais recente.",
  whatsapp: "Verifique a conexão do canal WhatsApp.",
  waha: "Verifique a instância WAHA.",
};

function defaultNextAction(def: MonitoringCheckDefinition): string {
  return CATEGORY_FALLBACK_ACTION[def.category] ?? `Revisar "${def.name}" (categoria ${def.category}).`;
}

export type EvaluateMonitoringSnapshotInput = {
  installation: Installation;
  results: MonitoringCheckResult[];
  /** Referência de "agora" pra detecção de check atrasado — nunca lida do relógio real em teste. */
  now?: Date;
};

/**
 * Avalia a saúde de UMA instalação a partir dos `results` fornecidos.
 * Regra de saúde geral: crítico "unhealthy" (ou crítico obrigatório ausente)
 * → `"unhealthy"`; qualquer outra falha (warning/info "unhealthy", ou
 * qualquer "degraded", ou obrigatório ausente não-crítico) → `"degraded"`;
 * sem falha e com pelo menos 1 check aplicável → `"healthy"`; nenhum check
 * aplicável → `"unknown"`. `disabled`/`skipped` nunca contam como sucesso.
 */
export function evaluateMonitoringSnapshot(input: EvaluateMonitoringSnapshotInput): MonitoringSnapshot {
  const { installation, results, now = new Date() } = input;
  const applicable = resolveApplicableMonitoringChecks(installation);
  const resultByCheckId = new Map(results.map((r) => [r.checkId, r]));

  const missingCheckIds: string[] = [];
  const lateCheckIds: string[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  let earnedWeight = 0;
  let totalWeight = 0;
  let hasCriticalUnhealthy = false;
  let hasSofterFailure = false;
  let topBlockerAction: string | undefined;
  let topWarningAction: string | undefined;

  for (const def of applicable) {
    const result = resultByCheckId.get(def.id);
    const status: MonitoringCheckStatus = result?.status ?? "unknown";
    const isMissing = !result;
    if (isMissing) missingCheckIds.push(def.id);

    if (result && def.expectedCadence) {
      const grace = CHECK_CADENCE_GRACE_MS[def.expectedCadence];
      if (grace !== null && now.getTime() - new Date(result.observedAt).getTime() > grace) {
        lateCheckIds.push(def.id);
        warnings.push(`[${def.category}] ${def.name}: check atrasado (última observação em ${result.observedAt}).`);
      }
    }

    if (status === "disabled") continue;

    const weight = MONITORING_SEVERITY_WEIGHT[def.severityWhenFailed];
    totalWeight += weight;

    if (status === "healthy") {
      earnedWeight += weight;
      continue;
    }

    const message = result?.message ?? `check obrigatório "${def.name}" sem resultado`;
    const action = result?.nextRecommendedAction ?? defaultNextAction(def);
    const line = `[${def.category}] ${def.name}: ${message}`;

    if (def.severityWhenFailed === "critical" && (status === "unhealthy" || isMissing)) {
      hasCriticalUnhealthy = true;
      blockers.push(line);
      topBlockerAction = topBlockerAction ?? action;
    } else {
      hasSofterFailure = true;
      warnings.push(line);
      topWarningAction = topWarningAction ?? action;
    }
  }

  const score = totalWeight === 0 ? 100 : Math.round((earnedWeight / totalWeight) * 100);

  let overallHealth: MonitoringCheckStatus;
  let status: MonitoringSnapshot["status"];
  if (applicable.length === 0) {
    overallHealth = "unknown";
    status = "draft";
  } else if (hasCriticalUnhealthy) {
    overallHealth = "unhealthy";
    status = missingCheckIds.length > 0 ? "partial" : "completed";
  } else if (hasSofterFailure) {
    overallHealth = "degraded";
    status = missingCheckIds.length > 0 ? "partial" : "completed";
  } else {
    overallHealth = "healthy";
    status = missingCheckIds.length > 0 ? "partial" : "completed";
  }

  return {
    id: crypto.randomUUID(),
    installationId: installation.id,
    tenantId: installation.tenant.id,
    plan: installation.deploymentPlan,
    status,
    overallHealth,
    score,
    checks: results,
    incidents: [],
    blockers,
    warnings,
    missingCheckIds,
    lateCheckIds,
    nextRecommendedAction: topBlockerAction ?? topWarningAction,
    createdAt: now.toISOString(),
  };
}

export type MonitoringScenario =
  | "healthy"
  | "degraded"
  | "critical"
  | "ssl-expiring"
  | "dns-failure"
  | "database-failure"
  | "redis-failure"
  | "worker-down"
  | "whatsapp-down"
  | "backup-stale"
  | "missing-checks"
  | "stale-checks"
  | "multiple-critical";

export const MONITORING_SCENARIOS: MonitoringScenario[] = [
  "healthy",
  "degraded",
  "critical",
  "ssl-expiring",
  "dns-failure",
  "database-failure",
  "redis-failure",
  "worker-down",
  "whatsapp-down",
  "backup-stale",
  "missing-checks",
  "stale-checks",
  "multiple-critical",
];

type ScenarioOverride = Partial<MonitoringCheckResult>;

const SCENARIO_OVERRIDES: Record<MonitoringScenario, Record<string, ScenarioOverride>> = {
  healthy: {},
  degraded: {
    storage_available: {
      status: "degraded",
      message: "uso de storage acima do esperado",
      nextRecommendedAction: "Verifique o uso de storage e considere upgrade.",
    },
  },
  critical: {
    database_reachable: {
      status: "unhealthy",
      message: "banco de dados não respondeu",
      nextRecommendedAction: "Verifique a conexão com o banco de dados imediatamente.",
    },
  },
  "ssl-expiring": {
    ssl_expiration: {
      status: "degraded",
      message: "certificado SSL expira em 5 dias",
      nextRecommendedAction: "Renove o certificado SSL.",
    },
  },
  "dns-failure": {
    dns_resolves: {
      status: "unhealthy",
      message: "domínio não resolve",
      nextRecommendedAction: "Verifique os registros DNS do domínio.",
    },
  },
  "database-failure": {
    database_reachable: {
      status: "unhealthy",
      message: "banco de dados inacessível",
      nextRecommendedAction: "Verifique a instância do banco de dados.",
    },
  },
  "redis-failure": {
    redis_available: {
      status: "unhealthy",
      message: "Redis inacessível",
      nextRecommendedAction: "Verifique o serviço Redis.",
    },
  },
  "worker-down": {
    worker_running: {
      status: "unhealthy",
      message: "worker não está rodando",
      nextRecommendedAction: "Reinicie o worker dedicado.",
    },
  },
  "whatsapp-down": {
    whatsapp_channel_configured: {
      status: "unhealthy",
      message: "canal WhatsApp desconectado",
      nextRecommendedAction: "Reconecte o número no canal WhatsApp.",
    },
    waha_available: {
      status: "unhealthy",
      message: "WAHA inacessível",
      nextRecommendedAction: "Verifique a instância WAHA.",
    },
  },
  "backup-stale": {
    backup_recent: {
      status: "degraded",
      message: "último backup há mais de 48h",
      nextRecommendedAction: "Verifique o job de backup.",
    },
  },
  "missing-checks": {},
  "stale-checks": {},
  "multiple-critical": {
    database_reachable: {
      status: "unhealthy",
      message: "banco de dados não respondeu",
      nextRecommendedAction: "Verifique a conexão com o banco de dados imediatamente.",
    },
    dns_resolves: {
      status: "unhealthy",
      message: "domínio não resolve",
      nextRecommendedAction: "Verifique os registros DNS do domínio.",
    },
    ssl_valid: {
      status: "unhealthy",
      message: "certificado SSL inválido",
      nextRecommendedAction: "Substitua o certificado SSL imediatamente.",
    },
  },
};

/**
 * Dry-run determinístico: resolve os checks aplicáveis, gera um resultado
 * simulado por check (sempre `"healthy"` por padrão, com overrides do
 * cenário escolhido) e avalia o snapshot resultante. Nunca ação real —
 * mesma doutrina de `simulateProvisioning` (`lib/provisioning/executor.ts`).
 */
export function simulateMonitoringRun(installation: Installation, scenario: MonitoringScenario = "healthy"): MonitoringSnapshot {
  const applicable = resolveApplicableMonitoringChecks(installation);
  const overrides = SCENARIO_OVERRIDES[scenario] ?? {};
  const now = new Date();

  let omitCheckId: string | undefined;
  if (scenario === "missing-checks") {
    omitCheckId = applicable.find((def) => def.severityWhenFailed !== "critical")?.id ?? applicable[0]?.id;
  }

  const results: MonitoringCheckResult[] = [];
  for (const def of applicable) {
    if (def.id === omitCheckId) continue;

    const override = overrides[def.id];
    let observedAt = now.toISOString();
    if (scenario === "stale-checks" && (def.expectedCadence === "hourly" || def.expectedCadence === "daily")) {
      const grace = CHECK_CADENCE_GRACE_MS[def.expectedCadence] ?? 0;
      observedAt = new Date(now.getTime() - grace - 60 * 60 * 1000).toISOString();
    }

    results.push({
      checkId: def.id,
      status: override?.status ?? "healthy",
      observedAt: override?.observedAt ?? observedAt,
      message: override?.message ?? `check "${def.name}" saudável (simulação)`,
      metadata: override?.metadata,
      nextRecommendedAction: override?.nextRecommendedAction,
    });
  }

  return evaluateMonitoringSnapshot({ installation, results, now });
}
