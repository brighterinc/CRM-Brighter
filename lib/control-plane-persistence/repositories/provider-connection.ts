/**
 * `DatabaseProviderConnectionRepository` — registro de configuração
 * SANITIZADA + ponteiro de secret pra um provider (`control_plane_provider_connections`).
 * `recordConnection` faz upsert em `(installation_id, provider)` (trava
 * `control_plane_provider_connections_installation_provider_uniq`) — nunca
 * conecta nada de verdade, `mode` é sempre `dry_run`/`simulation` nesta fase.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProvisioningAdapterMode, ProvisioningAdapterStatus, ProvisioningProvider } from "@/lib/provisioning-adapters/types";

import { providerConnectionDomainToUpsertRow, providerConnectionRowToDomain, type ControlPlaneProviderConnectionRow } from "../mappers/persistence";
import { assertSafePersistencePayload } from "../safe-persistence";
import type { PersistedProviderConnection } from "../types";

const TABLE = "control_plane_provider_connections";

export type RecordProviderConnectionInput = {
  installationId: string;
  provider: ProvisioningProvider;
  mode: ProvisioningAdapterMode;
  status: ProvisioningAdapterStatus;
  /** Passa por `assertSafePersistencePayload` aqui dentro — nunca credencial. */
  config: Record<string, unknown>;
  secretReferenceId?: string | null;
  connectedAt?: string;
};

export interface ProviderConnectionRepository {
  recordConnection(input: RecordProviderConnectionInput): Promise<PersistedProviderConnection>;
  listByInstallation(installationId: string): Promise<PersistedProviderConnection[]>;
  findConnection(installationId: string, provider: ProvisioningProvider): Promise<PersistedProviderConnection | null>;
}

export class DatabaseProviderConnectionRepository implements ProviderConnectionRepository {
  async recordConnection(input: RecordProviderConnectionInput): Promise<PersistedProviderConnection> {
    assertSafePersistencePayload(input.config, "DatabaseProviderConnectionRepository.recordConnection.config");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .upsert(providerConnectionDomainToUpsertRow(input), { onConflict: "installation_id,provider" })
      .select("*")
      .single();
    if (error) throw new Error(`[control-plane-persistence] ProviderConnectionRepository.recordConnection failed: ${error.message}`);
    return providerConnectionRowToDomain(data as ControlPlaneProviderConnectionRow);
  }

  async listByInstallation(installationId: string): Promise<PersistedProviderConnection[]> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(TABLE).select("*").eq("installation_id", installationId).order("created_at", { ascending: false });
    if (error) throw new Error(`[control-plane-persistence] ProviderConnectionRepository.listByInstallation failed: ${error.message}`);
    return (data as ControlPlaneProviderConnectionRow[]).map(providerConnectionRowToDomain);
  }

  async findConnection(installationId: string, provider: ProvisioningProvider): Promise<PersistedProviderConnection | null> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(TABLE).select("*").eq("installation_id", installationId).eq("provider", provider).maybeSingle();
    if (error) throw new Error(`[control-plane-persistence] ProviderConnectionRepository.findConnection failed: ${error.message}`);
    return data ? providerConnectionRowToDomain(data as ControlPlaneProviderConnectionRow) : null;
  }
}
