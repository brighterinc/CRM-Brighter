/**
 * Histórico de licenciamento — spec §13. Tudo em memória e sanitizado
 * (`sanitization.ts` reusa `sanitizeDeep` antes de qualquer log/export).
 */
import type { ModuleLicenseHistoryEntry, ModuleLicenseHistoryEventType } from "./types";

export type RecordHistoryEntryInput = {
  id: string;
  tenantId: string;
  installationId: string;
  moduleId: string;
  licenseId?: string;
  trialId?: string;
  type: ModuleLicenseHistoryEventType;
  message: string;
  metadata?: Record<string, unknown>;
  now?: string;
};

export function recordHistoryEntry(input: RecordHistoryEntryInput): ModuleLicenseHistoryEntry {
  return {
    id: input.id,
    tenantId: input.tenantId,
    installationId: input.installationId,
    moduleId: input.moduleId,
    licenseId: input.licenseId,
    trialId: input.trialId,
    type: input.type,
    occurredAt: input.now ?? new Date().toISOString(),
    message: input.message,
    metadata: input.metadata,
  };
}

export function filterHistoryByModule(entries: ModuleLicenseHistoryEntry[], moduleId: string): ModuleLicenseHistoryEntry[] {
  return entries.filter((e) => e.moduleId === moduleId);
}

export function filterHistoryByTenant(entries: ModuleLicenseHistoryEntry[], tenantId: string): ModuleLicenseHistoryEntry[] {
  return entries.filter((e) => e.tenantId === tenantId);
}

export function sortHistoryChronological(entries: ModuleLicenseHistoryEntry[]): ModuleLicenseHistoryEntry[] {
  return [...entries].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
}
