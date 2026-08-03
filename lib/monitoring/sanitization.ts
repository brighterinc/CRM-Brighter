/**
 * Sanitização do Monitoring Engine — Foundation v1.
 *
 * NÃO reimplementa a regex de chaves sensíveis: reusa `sanitizeDeep`
 * (`lib/tenants/export.ts`), a MESMA função que `lib/provisioning/logging.ts`
 * já reusa. Existe exatamente UM sanitizador recursivo no repositório —
 * duplicar aqui seria o anti-pattern #2 do CLAUDE.md ("duplicação sem
 * source of truth declarado").
 */
import { sanitizeDeep } from "@/lib/tenants/export";

import type { MonitoringCheckResult, MonitoringIncident } from "./types";

export { sanitizeDeep };

/** Retorna uma cópia do `MonitoringCheckResult` com `metadata` sanitizado recursivamente. */
export function sanitizeMonitoringCheckResult(result: MonitoringCheckResult): MonitoringCheckResult {
  if (!result.metadata) return result;
  return { ...result, metadata: sanitizeDeep(result.metadata) as Record<string, unknown> };
}

/** Retorna uma cópia do `MonitoringIncident` com `metadata` sanitizado recursivamente. */
export function sanitizeMonitoringIncident(incident: MonitoringIncident): MonitoringIncident {
  if (!incident.metadata) return incident;
  return { ...incident, metadata: sanitizeDeep(incident.metadata) as Record<string, unknown> };
}
