/**
 * Tipos centrais da Control Plane Persistence.
 *
 * Este módulo dá persistência REAL (Supabase, tabelas `control_plane_*`) às
 * fundações anteriores (`lib/tenants`, `lib/control-plane`, `lib/deployment`,
 * `lib/provisioning`, `lib/provisioning-adapters`) — nunca redefine o
 * domínio delas. `Tenant`/`Installation` continuam vindo de
 * `lib/tenants/types.ts`/`lib/control-plane/types.ts`; os tipos abaixo
 * cobrem só o que é NOVO desta fase: histórico de deployment, runs/steps de
 * provisionamento persistidos, conexões de provider e o vault de
 * referências de segredo.
 *
 * NENHUM tipo aqui carrega valor de segredo — só referência/metadata. Ver
 * `docs/control-plane-persistence/credentials-vault.md`.
 */
import type { DeploymentPlan, DeploymentTarget } from "@/lib/deployment";
import type { ProvisioningRunStatus, ProvisioningStepCategory, ProvisioningStepStatus } from "@/lib/provisioning/types";
import type { ProvisioningAdapterMode, ProvisioningAdapterStatus, ProvisioningProvider } from "@/lib/provisioning-adapters/types";

export type PersistedDeployment = {
  id: string;
  installationId: string | null;
  tenantId: string | null;
  target: DeploymentTarget;
  plan: DeploymentPlan;
  manifestFingerprint: string;
  /** Já passou por `assertSafePersistencePayload` antes de gravar — nunca segredo. */
  manifestSnapshot: Record<string, unknown>;
  /** ISO-8601 UTC. */
  generatedAt: string;
  /** ISO-8601 UTC. */
  createdAt: string;
};

export type PersistedProvisioningRun = {
  id: string;
  installationId: string;
  tenantId: string;
  plan: DeploymentPlan;
  target: DeploymentTarget;
  manifestFingerprint: string;
  status: ProvisioningRunStatus;
  blockers: string[];
  warnings: string[];
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
};

export type PersistedProvisioningStep = {
  id: string;
  runId: string;
  /** Id de `ProvisioningStepDefinition` (`lib/provisioning/catalog.ts`). */
  stepId: string;
  category: ProvisioningStepCategory;
  status: ProvisioningStepStatus;
  blockers: string[];
  warnings: string[];
  /** ISO-8601 UTC. */
  startedAt?: string;
  /** ISO-8601 UTC. */
  completedAt?: string;
  attempts: number;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
};

export type PersistedProviderConnection = {
  id: string;
  installationId: string;
  provider: ProvisioningProvider;
  mode: ProvisioningAdapterMode;
  status: ProvisioningAdapterStatus;
  /** Já sanitizada (`assertSafePersistencePayload`) — nunca credencial. */
  config: Record<string, unknown>;
  secretReferenceId: string | null;
  /** ISO-8601 UTC. */
  connectedAt?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
};

export type SecretReferenceType =
  | "api_key"
  | "oauth_token"
  | "database_password"
  | "ssh_key"
  | "webhook_secret"
  | "service_account"
  | "tls_certificate"
  | "other";

export const SECRET_REFERENCE_TYPES: SecretReferenceType[] = [
  "api_key",
  "oauth_token",
  "database_password",
  "ssh_key",
  "webhook_secret",
  "service_account",
  "tls_certificate",
  "other",
];

export type SecretReferenceStatus = "pending" | "active" | "rotated" | "revoked";

export const SECRET_REFERENCE_STATUSES: SecretReferenceStatus[] = ["pending", "active", "rotated", "revoked"];

/**
 * Backend que de fato guarda o valor do segredo. `"postgres_pgcrypto"` é o
 * PRIMEIRO backend real desta vocabulário (Real Vault Backend — ver
 * `lib/control-plane-persistence/vault/encryption-pgcrypto.ts`); os outros
 * três continuam sem guardar valor de verdade.
 */
export type VaultProvider = "noop" | "in_memory" | "database_placeholder" | "postgres_pgcrypto";

export const VAULT_PROVIDERS: VaultProvider[] = ["noop", "in_memory", "database_placeholder", "postgres_pgcrypto"];

/** `"platform"` cobre segredo que não é de um provider de instalação específico (ex.: SMTP compartilhado da Brighter). */
export type SecretReferenceProvider = ProvisioningProvider | "platform";

/**
 * Metadata pública de uma referência de segredo — NUNCA o valor. `vaultKey` é
 * um ponteiro OPACO pro backend do vault (nesta fase, sempre um placeholder —
 * ver `vault/database.ts`), nunca o segredo em si nem material suficiente
 * pra reconstruí-lo.
 */
export type SecretReferenceMetadata = {
  id: string;
  installationId: string | null;
  tenantId: string | null;
  reference: string;
  type: SecretReferenceType;
  provider: SecretReferenceProvider;
  vaultProvider: VaultProvider;
  vaultKey: string;
  version: number;
  status: SecretReferenceStatus;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
  /** ISO-8601 UTC. */
  rotatedAt?: string;
  /** ISO-8601 UTC. */
  revokedAt?: string;
  /** ISO-8601 UTC — última vez que um `RuntimeVaultProvider` resolveu o VALOR desta reference com sucesso. Bump via `SecretUsageRecorder.recordUsage` (`vault/types.ts`), nunca via `CredentialsVault` (que é metadata-write, não runtime). */
  lastUsedAt?: string;
};

export type OperationEventSeverity = "info" | "warning" | "error" | "success";

export const OPERATION_EVENT_SEVERITIES: OperationEventSeverity[] = ["info", "warning", "error", "success"];

/**
 * Vocabulário DE REFERÊNCIA (não exaustivo, não é CHECK no banco — ver
 * `docs/control-plane-persistence/schema.md` §"vocabulário aberto") dos
 * `event_type` que os `services.ts` desta fase emitem. Runtimes futuros
 * (provisioning/monitoring/billing real) vão somar tipos novos sem precisar
 * de migration — por isso é `readonly string[]`, não um union fechado.
 */
export const CONTROL_PLANE_OPERATION_EVENT_TYPES = [
  "tenant.created",
  "tenant.updated",
  "installation.created",
  "installation.updated",
  "installation.archived",
  "deployment.recorded",
  "provisioning_run.created",
  "provisioning_run.status_changed",
  "provisioning_step.recorded",
  "provider_connection.recorded",
  "secret_reference.created",
  "secret_reference.rotated",
  "secret_reference.revoked",
  // Real Supabase Adapter (lib/provisioning-adapters/providers/supabase-real*.ts)
  // — ciclo de vida de UMA chamada de operação real de provider, nunca
  // carrega credencial (ver supabase-real-control-plane.ts).
  "provider_operation.requested",
  "provider_operation.started",
  "provider_operation.completed",
  "provider_operation.failed",
  "provider_operation.blocked",
  // Real Vault Backend (lib/control-plane-persistence/vault/secret-value-service.ts)
  // — ciclo de vida do CIPHERTEXT (nunca do plaintext), separado do ciclo de
  // vida da metadata (secret_reference.* acima).
  "secret_value.stored",
  "secret_value.rotated",
  "secret_value.revoked",
] as const;

export type PersistedOperationEvent = {
  id: string;
  installationId: string | null;
  tenantId: string | null;
  provisioningRunId: string | null;
  /** Vocabulário aberto — ver `CONTROL_PLANE_OPERATION_EVENT_TYPES`. */
  eventType: string;
  severity: OperationEventSeverity;
  message: string;
  /** Já sanitizado (`assertSafePersistencePayload`) — nunca segredo. */
  metadata: Record<string, unknown>;
  actorUserId: string | null;
  /** ISO-8601 UTC. */
  occurredAt: string;
  /** ISO-8601 UTC. */
  createdAt: string;
};
