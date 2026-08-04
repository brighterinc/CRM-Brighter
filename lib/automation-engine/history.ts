/**
 * Histórico estruturado do Brighter Automation Engine. `metadata` sempre
 * passa por `sanitizeDeep` do Tenant Engine (`@/lib/tenants/export`) —
 * reusada, nunca reimplementada. Mesmo padrão de
 * `createProvisioningLogEntry` (`lib/provisioning/logging.ts`).
 */
import { sanitizeDeep } from "@/lib/tenants/export";

import type { WorkflowHistoryEntry, WorkflowHistoryLevel } from "./types";

export type CreateWorkflowHistoryEntryInput = {
  runId: string;
  workflowId: string;
  stepId?: string;
  level: WorkflowHistoryLevel;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export function createWorkflowHistoryEntry({
  runId,
  workflowId,
  stepId,
  level,
  event,
  message,
  metadata = {},
}: CreateWorkflowHistoryEntryInput): WorkflowHistoryEntry {
  return {
    timestamp: new Date().toISOString(),
    runId,
    workflowId,
    stepId,
    level,
    event,
    message,
    metadata: sanitizeDeep(metadata) as Record<string, unknown>,
  };
}
