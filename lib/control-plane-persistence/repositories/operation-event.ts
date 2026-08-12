/**
 * `DatabaseOperationEventRepository` — trilha append-only
 * `control_plane_operation_events`. Só `recordEvent`/`list*` — NUNCA update
 * nem delete (a tabela nem tem policy de RLS pra isso, ver migration
 * `0098_control_plane_persistence`), mesma doutrina de `api_audit_log`.
 */
import { createAdminClient } from "@/lib/supabase/admin";

import { operationEventDomainToInsertRow, operationEventRowToDomain, type ControlPlaneOperationEventRow } from "../mappers/persistence";
import { assertSafePersistencePayload } from "../safe-persistence";
import type { OperationEventSeverity, PersistedOperationEvent } from "../types";

const TABLE = "control_plane_operation_events";
const DEFAULT_LIST_LIMIT = 200;

export type RecordOperationEventInput = {
  installationId?: string | null;
  tenantId?: string | null;
  provisioningRunId?: string | null;
  eventType: string;
  severity: OperationEventSeverity;
  message: string;
  /** Passa por `assertSafePersistencePayload` aqui dentro — nunca segredo. */
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
};

export interface OperationEventRepository {
  recordEvent(input: RecordOperationEventInput): Promise<PersistedOperationEvent>;
  listByInstallation(installationId: string, limit?: number): Promise<PersistedOperationEvent[]>;
  listByTenant(tenantId: string, limit?: number): Promise<PersistedOperationEvent[]>;
  /** Sem filtro — visão geral pra admin UI. RLS já restringe a `fn_is_platform_admin()`. */
  listRecent(limit?: number): Promise<PersistedOperationEvent[]>;
}

export class DatabaseOperationEventRepository implements OperationEventRepository {
  async recordEvent(input: RecordOperationEventInput): Promise<PersistedOperationEvent> {
    const metadata = input.metadata ?? {};
    assertSafePersistencePayload(metadata, "DatabaseOperationEventRepository.recordEvent.metadata");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .insert(
        operationEventDomainToInsertRow({
          installationId: input.installationId ?? null,
          tenantId: input.tenantId ?? null,
          provisioningRunId: input.provisioningRunId ?? null,
          eventType: input.eventType,
          severity: input.severity,
          message: input.message,
          metadata,
          actorUserId: input.actorUserId ?? null,
          occurredAt: new Date().toISOString(),
        }),
      )
      .select("*")
      .single();
    if (error) throw new Error(`[control-plane-persistence] OperationEventRepository.recordEvent failed: ${error.message}`);
    return operationEventRowToDomain(data as ControlPlaneOperationEventRow);
  }

  async listByInstallation(installationId: string, limit: number = DEFAULT_LIST_LIMIT): Promise<PersistedOperationEvent[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .select("*")
      .eq("installation_id", installationId)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`[control-plane-persistence] OperationEventRepository.listByInstallation failed: ${error.message}`);
    return (data as ControlPlaneOperationEventRow[]).map(operationEventRowToDomain);
  }

  async listByTenant(tenantId: string, limit: number = DEFAULT_LIST_LIMIT): Promise<PersistedOperationEvent[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`[control-plane-persistence] OperationEventRepository.listByTenant failed: ${error.message}`);
    return (data as ControlPlaneOperationEventRow[]).map(operationEventRowToDomain);
  }

  async listRecent(limit: number = DEFAULT_LIST_LIMIT): Promise<PersistedOperationEvent[]> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(TABLE).select("*").order("occurred_at", { ascending: false }).limit(limit);
    if (error) throw new Error(`[control-plane-persistence] OperationEventRepository.listRecent failed: ${error.message}`);
    return (data as ControlPlaneOperationEventRow[]).map(operationEventRowToDomain);
  }
}
