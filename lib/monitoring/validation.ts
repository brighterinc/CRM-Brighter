/**
 * Validação estrutural do Monitoring Engine — Foundation v1.
 *
 * Puramente estrutural (formato, vocabulário fechado, referências válidas).
 * NUNCA chama rede pra "confirmar" nada — só confere que os dados de entrada
 * (sintéticos ou não) fazem sentido antes de entrarem no evaluator.
 */
import { getMonitoringCheckDefinition } from "./catalog";
import { isMonitoringCheckStatus, isMonitoringRunStatus } from "./status";
import type { MonitoringCheckResult, MonitoringSnapshot, MonitoringValidationError } from "./types";

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

/** Valida UM `MonitoringCheckResult` solto — usado antes de aceitar um resultado (real ou simulado) no evaluator. */
export function validateMonitoringCheckResult(result: MonitoringCheckResult): MonitoringValidationError[] {
  const errors: MonitoringValidationError[] = [];

  if (!result.checkId || result.checkId.trim().length === 0) {
    errors.push({ field: "checkId", message: "obrigatório" });
  } else if (!getMonitoringCheckDefinition(result.checkId)) {
    errors.push({ field: "checkId", message: `check desconhecido no catálogo: "${result.checkId}"` });
  }

  if (!isMonitoringCheckStatus(result.status)) {
    errors.push({ field: "status", message: `status inválido: "${String(result.status)}"` });
  }

  if (!isIsoDateString(result.observedAt)) {
    errors.push({ field: "observedAt", message: "deve ser uma data ISO-8601 válida" });
  }

  if (!result.message || result.message.trim().length === 0) {
    errors.push({ field: "message", message: "obrigatório" });
  }

  if (result.durationMs !== undefined && (!Number.isFinite(result.durationMs) || result.durationMs < 0)) {
    errors.push({ field: "durationMs", message: "deve ser um número >= 0" });
  }

  return errors;
}

/** Valida um `MonitoringSnapshot` já montado — usado pelo repositório antes de aceitar `saveSnapshot`. */
export function validateMonitoringSnapshotInput(snapshot: MonitoringSnapshot): MonitoringValidationError[] {
  const errors: MonitoringValidationError[] = [];

  if (!snapshot.installationId || snapshot.installationId.trim().length === 0) {
    errors.push({ field: "installationId", message: "obrigatório" });
  }
  if (!snapshot.tenantId || snapshot.tenantId.trim().length === 0) {
    errors.push({ field: "tenantId", message: "obrigatório" });
  }
  if (!isMonitoringRunStatus(snapshot.status)) {
    errors.push({ field: "status", message: `status de run inválido: "${String(snapshot.status)}"` });
  }
  if (!isMonitoringCheckStatus(snapshot.overallHealth)) {
    errors.push({ field: "overallHealth", message: `saúde geral inválida: "${String(snapshot.overallHealth)}"` });
  }
  if (!Number.isFinite(snapshot.score) || snapshot.score < 0 || snapshot.score > 100) {
    errors.push({ field: "score", message: "deve ser um número entre 0 e 100" });
  }
  if (!isIsoDateString(snapshot.createdAt)) {
    errors.push({ field: "createdAt", message: "deve ser uma data ISO-8601 válida" });
  }

  snapshot.checks.forEach((check, index) => {
    for (const err of validateMonitoringCheckResult(check)) {
      errors.push({ field: `checks[${index}].${err.field}`, message: err.message });
    }
  });

  return errors;
}
