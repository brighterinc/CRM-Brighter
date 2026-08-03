/**
 * Logs estruturados do Brighter Provisioning Engine. `metadata` sempre passa
 * por `sanitizeDeep` do Tenant Engine (`@/lib/tenants/export`) — reusada, não
 * reimplementada — que remove recursivamente qualquer chave batendo
 * `password|token|api[_-]?key|secret|service[_-]?role|database[_-]?url|
 * connection[_-]?string|ssh[_-]?key|private[_-]?key` (case-insensitive),
 * mesmo em objeto "sujo" com propriedade extra fora do tipo.
 */
import { sanitizeDeep } from "@/lib/tenants/export";

import type { ProvisioningExecutionContext, ProvisioningLogEntry, ProvisioningLogLevel } from "./types";

export type CreateProvisioningLogEntryInput = {
  ctx: ProvisioningExecutionContext;
  level: ProvisioningLogLevel;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export function createProvisioningLogEntry({
  ctx,
  level,
  event,
  message,
  metadata = {},
}: CreateProvisioningLogEntryInput): ProvisioningLogEntry {
  return {
    timestamp: new Date().toISOString(),
    runId: ctx.runId,
    tenantId: ctx.tenantId,
    stepId: ctx.stepId,
    level,
    event,
    message,
    metadata: sanitizeDeep(metadata) as Record<string, unknown>,
  };
}
