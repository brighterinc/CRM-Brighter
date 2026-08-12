/**
 * Mappers `control_plane_*` <-> domínio para as 6 entidades desta fase que
 * NÃO reusam um tipo de domínio pré-existente de outra Foundation (ao
 * contrário de tenant/installation — ver `mappers/tenant.ts`/`installation.ts`).
 * `Persisted*`/`SecretReferenceMetadata` são definidos em `../types.ts`.
 *
 * Convenção única deste arquivo: nunca deixar snake_case vazar pro domínio —
 * toda leitura passa por `*RowToDomain`, toda escrita por `*DomainToInsertRow`.
 */
import type {
  OperationEventSeverity,
  PersistedDeployment,
  PersistedOperationEvent,
  PersistedProviderConnection,
  PersistedProvisioningRun,
  PersistedProvisioningStep,
  SecretReferenceMetadata,
  SecretReferenceProvider,
  SecretReferenceStatus,
  SecretReferenceType,
  VaultProvider,
} from "../types";

// ---------------------------------------------------------------------------
// control_plane_deployments
// ---------------------------------------------------------------------------

export type ControlPlaneDeploymentRow = {
  id: string;
  installation_id: string | null;
  tenant_id: string | null;
  target: string;
  plan: string;
  manifest_fingerprint: string;
  manifest_snapshot: Record<string, unknown>;
  generated_at: string;
  created_at: string;
};

export function deploymentRowToDomain(row: ControlPlaneDeploymentRow): PersistedDeployment {
  return {
    id: row.id,
    installationId: row.installation_id,
    tenantId: row.tenant_id,
    target: row.target as PersistedDeployment["target"],
    plan: row.plan as PersistedDeployment["plan"],
    manifestFingerprint: row.manifest_fingerprint,
    manifestSnapshot: row.manifest_snapshot,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
  };
}

export type ControlPlaneDeploymentInsertRow = Omit<ControlPlaneDeploymentRow, "id" | "created_at">;

export function deploymentDomainToInsertRow(input: {
  installationId: string | null;
  tenantId: string | null;
  target: PersistedDeployment["target"];
  plan: PersistedDeployment["plan"];
  manifestFingerprint: string;
  manifestSnapshot: Record<string, unknown>;
  generatedAt: string;
}): ControlPlaneDeploymentInsertRow {
  return {
    installation_id: input.installationId,
    tenant_id: input.tenantId,
    target: input.target,
    plan: input.plan,
    manifest_fingerprint: input.manifestFingerprint,
    manifest_snapshot: input.manifestSnapshot,
    generated_at: input.generatedAt,
  };
}

// ---------------------------------------------------------------------------
// control_plane_provisioning_runs
// ---------------------------------------------------------------------------

export type ControlPlaneProvisioningRunRow = {
  id: string;
  installation_id: string;
  tenant_id: string;
  plan: string;
  target: string;
  manifest_fingerprint: string;
  status: string;
  blockers: string[];
  warnings: string[];
  created_at: string;
  updated_at: string;
};

export function provisioningRunRowToDomain(row: ControlPlaneProvisioningRunRow): PersistedProvisioningRun {
  return {
    id: row.id,
    installationId: row.installation_id,
    tenantId: row.tenant_id,
    plan: row.plan as PersistedProvisioningRun["plan"],
    target: row.target as PersistedProvisioningRun["target"],
    manifestFingerprint: row.manifest_fingerprint,
    status: row.status as PersistedProvisioningRun["status"],
    blockers: row.blockers,
    warnings: row.warnings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ControlPlaneProvisioningRunInsertRow = Omit<ControlPlaneProvisioningRunRow, "id" | "created_at" | "updated_at">;

export function provisioningRunDomainToInsertRow(input: {
  installationId: string;
  tenantId: string;
  plan: PersistedProvisioningRun["plan"];
  target: PersistedProvisioningRun["target"];
  manifestFingerprint: string;
  status: PersistedProvisioningRun["status"];
  blockers: string[];
  warnings: string[];
}): ControlPlaneProvisioningRunInsertRow {
  return {
    installation_id: input.installationId,
    tenant_id: input.tenantId,
    plan: input.plan,
    target: input.target,
    manifest_fingerprint: input.manifestFingerprint,
    status: input.status,
    blockers: input.blockers,
    warnings: input.warnings,
  };
}

// ---------------------------------------------------------------------------
// control_plane_provisioning_steps
// ---------------------------------------------------------------------------

export type ControlPlaneProvisioningStepRow = {
  id: string;
  run_id: string;
  step_id: string;
  category: string;
  status: string;
  blockers: string[];
  warnings: string[];
  started_at: string | null;
  completed_at: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
};

export function provisioningStepRowToDomain(row: ControlPlaneProvisioningStepRow): PersistedProvisioningStep {
  return {
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id,
    category: row.category as PersistedProvisioningStep["category"],
    status: row.status as PersistedProvisioningStep["status"],
    blockers: row.blockers,
    warnings: row.warnings,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ControlPlaneProvisioningStepUpsertRow = Omit<ControlPlaneProvisioningStepRow, "id" | "created_at" | "updated_at">;

export function provisioningStepDomainToUpsertRow(input: {
  runId: string;
  stepId: string;
  category: PersistedProvisioningStep["category"];
  status: PersistedProvisioningStep["status"];
  blockers: string[];
  warnings: string[];
  startedAt?: string;
  completedAt?: string;
  attempts: number;
}): ControlPlaneProvisioningStepUpsertRow {
  return {
    run_id: input.runId,
    step_id: input.stepId,
    category: input.category,
    status: input.status,
    blockers: input.blockers,
    warnings: input.warnings,
    started_at: input.startedAt ?? null,
    completed_at: input.completedAt ?? null,
    attempts: input.attempts,
  };
}

// ---------------------------------------------------------------------------
// control_plane_provider_connections
// ---------------------------------------------------------------------------

export type ControlPlaneProviderConnectionRow = {
  id: string;
  installation_id: string;
  provider: string;
  mode: string;
  status: string;
  config: Record<string, unknown>;
  secret_reference_id: string | null;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
};

export function providerConnectionRowToDomain(row: ControlPlaneProviderConnectionRow): PersistedProviderConnection {
  return {
    id: row.id,
    installationId: row.installation_id,
    provider: row.provider as PersistedProviderConnection["provider"],
    mode: row.mode as PersistedProviderConnection["mode"],
    status: row.status as PersistedProviderConnection["status"],
    config: row.config,
    secretReferenceId: row.secret_reference_id,
    connectedAt: row.connected_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ControlPlaneProviderConnectionUpsertRow = Omit<ControlPlaneProviderConnectionRow, "id" | "created_at" | "updated_at">;

export function providerConnectionDomainToUpsertRow(input: {
  installationId: string;
  provider: PersistedProviderConnection["provider"];
  mode: PersistedProviderConnection["mode"];
  status: PersistedProviderConnection["status"];
  config: Record<string, unknown>;
  secretReferenceId?: string | null;
  connectedAt?: string;
}): ControlPlaneProviderConnectionUpsertRow {
  return {
    installation_id: input.installationId,
    provider: input.provider,
    mode: input.mode,
    status: input.status,
    config: input.config,
    secret_reference_id: input.secretReferenceId ?? null,
    connected_at: input.connectedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// control_plane_secret_references
// ---------------------------------------------------------------------------

export type ControlPlaneSecretReferenceRow = {
  id: string;
  installation_id: string | null;
  tenant_id: string | null;
  reference: string;
  type: string;
  provider: string;
  vault_provider: string;
  vault_key: string;
  version: number;
  status: string;
  created_at: string;
  updated_at: string;
  rotated_at: string | null;
  revoked_at: string | null;
};

export function secretReferenceRowToMetadata(row: ControlPlaneSecretReferenceRow): SecretReferenceMetadata {
  return {
    id: row.id,
    installationId: row.installation_id,
    tenantId: row.tenant_id,
    reference: row.reference,
    type: row.type as SecretReferenceType,
    provider: row.provider as SecretReferenceProvider,
    vaultProvider: row.vault_provider as VaultProvider,
    vaultKey: row.vault_key,
    version: row.version,
    status: row.status as SecretReferenceStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rotatedAt: row.rotated_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
  };
}

export type ControlPlaneSecretReferenceInsertRow = {
  installation_id: string | null;
  tenant_id: string | null;
  reference: string;
  type: string;
  provider: string;
  vault_provider: string;
  vault_key: string;
  version: number;
  status: string;
};

export function secretReferenceDomainToInsertRow(input: {
  installationId?: string | null;
  tenantId?: string | null;
  reference: string;
  type: SecretReferenceType;
  provider: SecretReferenceProvider;
  vaultProvider: VaultProvider;
  vaultKey: string;
}): ControlPlaneSecretReferenceInsertRow {
  return {
    installation_id: input.installationId ?? null,
    tenant_id: input.tenantId ?? null,
    reference: input.reference,
    type: input.type,
    provider: input.provider,
    vault_provider: input.vaultProvider,
    vault_key: input.vaultKey,
    version: 1,
    status: "active",
  };
}

// ---------------------------------------------------------------------------
// control_plane_operation_events
// ---------------------------------------------------------------------------

export type ControlPlaneOperationEventRow = {
  id: string;
  installation_id: string | null;
  tenant_id: string | null;
  provisioning_run_id: string | null;
  event_type: string;
  severity: string;
  message: string;
  metadata: Record<string, unknown>;
  actor_user_id: string | null;
  occurred_at: string;
  created_at: string;
};

export function operationEventRowToDomain(row: ControlPlaneOperationEventRow): PersistedOperationEvent {
  return {
    id: row.id,
    installationId: row.installation_id,
    tenantId: row.tenant_id,
    provisioningRunId: row.provisioning_run_id,
    eventType: row.event_type,
    severity: row.severity as OperationEventSeverity,
    message: row.message,
    metadata: row.metadata,
    actorUserId: row.actor_user_id,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

export type ControlPlaneOperationEventInsertRow = Omit<ControlPlaneOperationEventRow, "id" | "created_at">;

export function operationEventDomainToInsertRow(input: {
  installationId?: string | null;
  tenantId?: string | null;
  provisioningRunId?: string | null;
  eventType: string;
  severity: OperationEventSeverity;
  message: string;
  metadata: Record<string, unknown>;
  actorUserId?: string | null;
  occurredAt: string;
}): ControlPlaneOperationEventInsertRow {
  return {
    installation_id: input.installationId ?? null,
    tenant_id: input.tenantId ?? null,
    provisioning_run_id: input.provisioningRunId ?? null,
    event_type: input.eventType,
    severity: input.severity,
    message: input.message,
    metadata: input.metadata,
    actor_user_id: input.actorUserId ?? null,
    occurred_at: input.occurredAt,
  };
}
