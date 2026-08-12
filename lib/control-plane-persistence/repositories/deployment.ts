/**
 * `DatabaseDeploymentRepository` — histórico versionado de `DeploymentManifest`
 * gerado (`control_plane_deployments`). Interface NOVA desta fase (não existe
 * um `DeploymentRepository` in-memory anterior pra implementar) — snapshot,
 * nunca a view "atual" (essa é sempre derivada do tenant, ver `installation.ts`).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { DeploymentPlan, DeploymentTarget } from "@/lib/deployment";

import { deploymentDomainToInsertRow, deploymentRowToDomain, type ControlPlaneDeploymentRow } from "../mappers/persistence";
import { assertSafePersistencePayload } from "../safe-persistence";
import type { PersistedDeployment } from "../types";

const TABLE = "control_plane_deployments";

export type RecordDeploymentInput = {
  installationId?: string | null;
  tenantId?: string | null;
  target: DeploymentTarget;
  plan: DeploymentPlan;
  manifestFingerprint: string;
  /** Passa por `assertSafePersistencePayload` aqui dentro — chamador não precisa sanitizar antes. */
  manifestSnapshot: Record<string, unknown>;
};

export interface DeploymentRepository {
  recordDeployment(input: RecordDeploymentInput): Promise<PersistedDeployment>;
  listByInstallation(installationId: string): Promise<PersistedDeployment[]>;
  findLatestByInstallation(installationId: string): Promise<PersistedDeployment | null>;
}

export class DatabaseDeploymentRepository implements DeploymentRepository {
  async recordDeployment(input: RecordDeploymentInput): Promise<PersistedDeployment> {
    assertSafePersistencePayload(input.manifestSnapshot, "DatabaseDeploymentRepository.recordDeployment.manifestSnapshot");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .insert(
        deploymentDomainToInsertRow({
          installationId: input.installationId ?? null,
          tenantId: input.tenantId ?? null,
          target: input.target,
          plan: input.plan,
          manifestFingerprint: input.manifestFingerprint,
          manifestSnapshot: input.manifestSnapshot,
          generatedAt: new Date().toISOString(),
        }),
      )
      .select("*")
      .single();
    if (error) throw new Error(`[control-plane-persistence] DeploymentRepository.recordDeployment failed: ${error.message}`);
    return deploymentRowToDomain(data as ControlPlaneDeploymentRow);
  }

  async listByInstallation(installationId: string): Promise<PersistedDeployment[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .select("*")
      .eq("installation_id", installationId)
      .order("generated_at", { ascending: false });
    if (error) throw new Error(`[control-plane-persistence] DeploymentRepository.listByInstallation failed: ${error.message}`);
    return (data as ControlPlaneDeploymentRow[]).map(deploymentRowToDomain);
  }

  async findLatestByInstallation(installationId: string): Promise<PersistedDeployment | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .select("*")
      .eq("installation_id", installationId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`[control-plane-persistence] DeploymentRepository.findLatestByInstallation failed: ${error.message}`);
    return data ? deploymentRowToDomain(data as ControlPlaneDeploymentRow) : null;
  }
}
