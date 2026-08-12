/**
 * `DatabaseProvisioningRepository` — runs + steps de provisionamento
 * persistidos (`control_plane_provisioning_runs`/`_steps`). Interface NOVA
 * desta fase; `upsertStep` é a idempotência pedida: reprocessar o mesmo
 * `(runId, stepId)` faz UPDATE, nunca duplica linha (mesma trava da
 * unique index `control_plane_provisioning_steps_run_step_uniq`).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { DeploymentPlan, DeploymentTarget } from "@/lib/deployment";
import type { ProvisioningRunStatus, ProvisioningStepCategory, ProvisioningStepStatus } from "@/lib/provisioning/types";

import {
  provisioningRunDomainToInsertRow,
  provisioningRunRowToDomain,
  provisioningStepDomainToUpsertRow,
  provisioningStepRowToDomain,
  type ControlPlaneProvisioningRunRow,
  type ControlPlaneProvisioningStepRow,
} from "../mappers/persistence";
import type { PersistedProvisioningRun, PersistedProvisioningStep } from "../types";

export { ProvisioningRunNotFoundError } from "./provisioning-errors";

const RUNS_TABLE = "control_plane_provisioning_runs";
const STEPS_TABLE = "control_plane_provisioning_steps";

export type CreateProvisioningRunInput = {
  installationId: string;
  tenantId: string;
  plan: DeploymentPlan;
  target: DeploymentTarget;
  manifestFingerprint: string;
  status: ProvisioningRunStatus;
  blockers?: string[];
  warnings?: string[];
};

export type UpsertProvisioningStepInput = {
  runId: string;
  stepId: string;
  category: ProvisioningStepCategory;
  status: ProvisioningStepStatus;
  blockers?: string[];
  warnings?: string[];
  startedAt?: string;
  completedAt?: string;
  attempts?: number;
};

export interface ProvisioningRunRepository {
  createRun(input: CreateProvisioningRunInput): Promise<PersistedProvisioningRun>;
  findRun(id: string): Promise<PersistedProvisioningRun | null>;
  listRunsByInstallation(installationId: string): Promise<PersistedProvisioningRun[]>;
  updateRunStatus(id: string, status: ProvisioningRunStatus): Promise<PersistedProvisioningRun>;
  upsertStep(input: UpsertProvisioningStepInput): Promise<PersistedProvisioningStep>;
  listSteps(runId: string): Promise<PersistedProvisioningStep[]>;
}

export class DatabaseProvisioningRepository implements ProvisioningRunRepository {
  async createRun(input: CreateProvisioningRunInput): Promise<PersistedProvisioningRun> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(RUNS_TABLE)
      .insert(
        provisioningRunDomainToInsertRow({
          installationId: input.installationId,
          tenantId: input.tenantId,
          plan: input.plan,
          target: input.target,
          manifestFingerprint: input.manifestFingerprint,
          status: input.status,
          blockers: input.blockers ?? [],
          warnings: input.warnings ?? [],
        }),
      )
      .select("*")
      .single();
    if (error) throw new Error(`[control-plane-persistence] ProvisioningRepository.createRun failed: ${error.message}`);
    return provisioningRunRowToDomain(data as ControlPlaneProvisioningRunRow);
  }

  async findRun(id: string): Promise<PersistedProvisioningRun | null> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(RUNS_TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`[control-plane-persistence] ProvisioningRepository.findRun failed: ${error.message}`);
    return data ? provisioningRunRowToDomain(data as ControlPlaneProvisioningRunRow) : null;
  }

  async listRunsByInstallation(installationId: string): Promise<PersistedProvisioningRun[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(RUNS_TABLE)
      .select("*")
      .eq("installation_id", installationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`[control-plane-persistence] ProvisioningRepository.listRunsByInstallation failed: ${error.message}`);
    return (data as ControlPlaneProvisioningRunRow[]).map(provisioningRunRowToDomain);
  }

  async updateRunStatus(id: string, status: ProvisioningRunStatus): Promise<PersistedProvisioningRun> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(RUNS_TABLE).update({ status }).eq("id", id).select("*").single();
    if (error) throw new Error(`[control-plane-persistence] ProvisioningRepository.updateRunStatus failed: ${error.message}`);
    return provisioningRunRowToDomain(data as ControlPlaneProvisioningRunRow);
  }

  async upsertStep(input: UpsertProvisioningStepInput): Promise<PersistedProvisioningStep> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(STEPS_TABLE)
      .upsert(
        provisioningStepDomainToUpsertRow({
          runId: input.runId,
          stepId: input.stepId,
          category: input.category,
          status: input.status,
          blockers: input.blockers ?? [],
          warnings: input.warnings ?? [],
          startedAt: input.startedAt,
          completedAt: input.completedAt,
          attempts: input.attempts ?? 0,
        }),
        { onConflict: "run_id,step_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(`[control-plane-persistence] ProvisioningRepository.upsertStep failed: ${error.message}`);
    return provisioningStepRowToDomain(data as ControlPlaneProvisioningStepRow);
  }

  async listSteps(runId: string): Promise<PersistedProvisioningStep[]> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(STEPS_TABLE).select("*").eq("run_id", runId).order("created_at", { ascending: true });
    if (error) throw new Error(`[control-plane-persistence] ProvisioningRepository.listSteps failed: ${error.message}`);
    return (data as ControlPlaneProvisioningStepRow[]).map(provisioningStepRowToDomain);
  }
}
