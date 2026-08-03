/**
 * Vocabulários crus do Monitoring Engine — arrays fechados, type guards e
 * agrupamentos derivados. Mesmo papel de `lib/control-plane/status.ts`:
 * este arquivo só declara o vocabulário; metadado (label/descrição) mora em
 * `catalog.ts`, e a lógica de avaliação mora em `evaluator.ts`.
 */
import type {
  MonitoringCategory,
  MonitoringCheckCadence,
  MonitoringCheckStatus,
  MonitoringIncidentStatus,
  MonitoringRunStatus,
  MonitoringSeverity,
} from "./types";

export const MONITORING_CHECK_STATUSES: MonitoringCheckStatus[] = [
  "unknown",
  "pending",
  "healthy",
  "degraded",
  "unhealthy",
  "skipped",
  "disabled",
];

export const MONITORING_SEVERITIES: MonitoringSeverity[] = ["info", "warning", "critical"];

export const MONITORING_RUN_STATUSES: MonitoringRunStatus[] = ["draft", "running", "completed", "partial", "failed"];

export const MONITORING_CATEGORIES: MonitoringCategory[] = [
  "application",
  "domain",
  "dns",
  "ssl",
  "database",
  "authentication",
  "storage",
  "redis",
  "worker",
  "scheduler",
  "email",
  "whatsapp",
  "chatwoot",
  "evolution",
  "waha",
  "backup",
  "monitoring",
  "integration",
];

export const MONITORING_CHECK_CADENCES: MonitoringCheckCadence[] = ["manual", "hourly", "daily", "weekly"];

export const MONITORING_INCIDENT_STATUSES: MonitoringIncidentStatus[] = [
  "open",
  "acknowledged",
  "investigating",
  "resolved",
  "ignored",
];

export function isMonitoringCheckStatus(value: unknown): value is MonitoringCheckStatus {
  return typeof value === "string" && (MONITORING_CHECK_STATUSES as string[]).includes(value);
}

export function isMonitoringSeverity(value: unknown): value is MonitoringSeverity {
  return typeof value === "string" && (MONITORING_SEVERITIES as string[]).includes(value);
}

export function isMonitoringRunStatus(value: unknown): value is MonitoringRunStatus {
  return typeof value === "string" && (MONITORING_RUN_STATUSES as string[]).includes(value);
}

export function isMonitoringCategory(value: unknown): value is MonitoringCategory {
  return typeof value === "string" && (MONITORING_CATEGORIES as string[]).includes(value);
}

export function isMonitoringIncidentStatus(value: unknown): value is MonitoringIncidentStatus {
  return typeof value === "string" && (MONITORING_INCIDENT_STATUSES as string[]).includes(value);
}

/** Status que NUNCA contam como sucesso — nem pro score, nem pra "está tudo bem". */
export const NON_SUCCESS_CHECK_STATUSES: MonitoringCheckStatus[] = [
  "unknown",
  "pending",
  "degraded",
  "unhealthy",
  "skipped",
];

/** Status que indicam falha de verdade (candidatos a blocker/warning/incidente). */
export const FAILURE_CHECK_STATUSES: MonitoringCheckStatus[] = ["degraded", "unhealthy"];

/** Status de incidente considerados "em aberto" pra fins de deduplicação/contagem. */
export const OPEN_INCIDENT_STATUSES: MonitoringIncidentStatus[] = ["open", "acknowledged", "investigating"];

/** Janela de tolerância (ms) por cadência — passou disso, o check é "atrasado". `manual` nunca atrasa. */
export const CHECK_CADENCE_GRACE_MS: Record<MonitoringCheckCadence, number | null> = {
  manual: null,
  hourly: 2 * 60 * 60 * 1000,
  daily: 36 * 60 * 60 * 1000,
  weekly: 9 * 24 * 60 * 60 * 1000,
};

/** Peso por severidade — usado só pelo cálculo determinístico de score em `evaluator.ts`. */
export const MONITORING_SEVERITY_WEIGHT: Record<MonitoringSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};
