/**
 * Sanitização do Brighter Automation Engine — Foundation v1.
 *
 * NÃO reimplementa a regex de chaves sensíveis: reusa `sanitizeDeep`
 * (`lib/tenants/export.ts`), a MESMA função que `lib/provisioning/logging.ts`
 * e `lib/monitoring/sanitization.ts` já reusam. Existe exatamente UM
 * sanitizador recursivo no repositório — duplicar aqui seria o anti-pattern
 * #2 do CLAUDE.md ("duplicação sem source of truth declarado").
 *
 * `createWorkflowHistoryEntry` (`history.ts`) já sanitiza `metadata` na
 * criação — as funções abaixo existem pra sanitizar um `WorkflowRun`
 * INTEIRO (ex.: antes de expor via CLI/export), reprocessando `history`
 * mesmo que algum item tenha entrado sem passar por `createWorkflowHistoryEntry`.
 */
import { sanitizeDeep } from "@/lib/tenants/export";

import type { WorkflowHistoryEntry, WorkflowRun } from "./types";

export { sanitizeDeep };

export function sanitizeWorkflowHistoryEntry(entry: WorkflowHistoryEntry): WorkflowHistoryEntry {
  if (!entry.metadata) return entry;
  return { ...entry, metadata: sanitizeDeep(entry.metadata) as Record<string, unknown> };
}

export function sanitizeWorkflowRun(run: WorkflowRun): WorkflowRun {
  return { ...run, history: run.history.map(sanitizeWorkflowHistoryEntry) };
}
