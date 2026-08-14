/**
 * Camada de serviço — o único lugar que orquestra repository + audit log +
 * operation event pra uma mutação da Control Plane Persistence. Nenhuma
 * rota/UI/CLI deve chamar um `Database*Repository` direto pra uma mutação
 * (leitura tudo bem); isso garante que TODA escrita sai auditada nos dois
 * lugares — `api_audit_log` ("quem fez", via `audit()`) e
 * `control_plane_operation_events` ("o que aconteceu com esta instalação").
 * Não são a mesma coisa — ver `docs/control-plane-persistence/security.md`.
 *
 * `assertSafePersistencePayload` já roda DENTRO de cada repository (defesa
 * em profundidade — nunca confiar só na camada de cima); aqui ela roda de
 * novo no payload bruto, antes de qualquer I/O, pra falhar o mais cedo
 * possível e nunca deixar um payload sujo chegar nem perto do audit log.
 *
 * `audit()` NUNCA é importado no topo deste arquivo — `lib/audit/index.ts`
 * importa (transitivamente) `lib/env.ts`, que VALIDA env vars do Supabase NA
 * HORA do import e lança se faltarem. Isso quebrava `pnpm control:persistence`
 * (CLI 100% in-memory, roda sem `.env`) mesmo sem NENHUM caminho de código
 * realmente precisar de Supabase. `emitAudit` é injetado (default =
 * `import("@/lib/audit")` sob demanda, só quando de fato chamado) — quem
 * chama em contexto sem env real (CLI, teste in-memory) passa um
 * `emitAudit` próprio (ex.: no-op) sem precisar tocar `lib/audit`.
 *
 * Nenhuma função aqui chama provider externo, Docker, rede ou a Lumina —
 * só repository (`ControlPlaneRepositories`, injetado explicitamente,
 * nunca singleton global) + `emitAudit()` + `operationEvents.recordEvent()`.
 */
import type { AuditAction } from "@/lib/audit/actions";
import type { InstallationCreateInput } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";
import type { TenantCreateInput } from "@/lib/tenants/repository";
import type { Tenant } from "@/lib/tenants/types";

import type { ControlPlaneRepositories } from "./repositories/factory";
import type { RecordDeploymentInput } from "./repositories/deployment";
import type { RecordOperationEventInput } from "./repositories/operation-event";
import type { RecordProviderConnectionInput } from "./repositories/provider-connection";
import type { CreateProvisioningRunInput, UpsertProvisioningStepInput } from "./repositories/provisioning";
import { ProvisioningRunNotFoundError } from "./repositories/provisioning-errors";
import { assertSafePersistencePayload } from "./safe-persistence";
import type {
  PersistedDeployment,
  PersistedOperationEvent,
  PersistedProviderConnection,
  PersistedProvisioningRun,
  PersistedProvisioningStep,
  SecretReferenceMetadata,
} from "./types";
import type { CreateSecretReferenceInput } from "./vault/types";

/** Mesmo shape de `AuditEntry` (`lib/audit/index.ts`, não exportado de lá — duck-typed aqui de propósito). */
export type AuditEmitInput = {
  action: AuditAction;
  actorUserId?: string | null;
  organizationId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
};

export type AuditEmitter = (entry: AuditEmitInput) => Promise<void>;

/** Só importa `@/lib/audit` (e, transitivamente, `lib/env.ts`) quando de fato chamada. */
const defaultAuditEmitter: AuditEmitter = async (entry) => {
  const { audit } = await import("@/lib/audit");
  await audit(entry);
};

export type ControlPlaneActorContext = {
  /** `null`/ausente = evento gerado pelo sistema (worker/CLI), não por um usuário. */
  actorUserId?: string | null;
  requestId?: string | null;
  /** Default: escreve em `api_audit_log` de verdade. CLI/teste in-memory passam um no-op. */
  emitAudit?: AuditEmitter;
};

async function emitAudit(ctx: ControlPlaneActorContext, entry: AuditEmitInput): Promise<void> {
  await (ctx.emitAudit ?? defaultAuditEmitter)(entry);
}

async function emitOperationEvent(
  repos: ControlPlaneRepositories,
  input: RecordOperationEventInput,
): Promise<PersistedOperationEvent> {
  return repos.operationEvents.recordEvent(input);
}

// ---------------------------------------------------------------------------
// createPersistedTenant
// ---------------------------------------------------------------------------

export async function createPersistedTenant(
  repos: ControlPlaneRepositories,
  input: TenantCreateInput,
  ctx: ControlPlaneActorContext = {},
): Promise<Tenant> {
  assertSafePersistencePayload(input, "createPersistedTenant.input");
  const tenant = await repos.tenants.create(input);

  await emitAudit(ctx, {
    action: "control_plane.tenant_created",
    actorUserId: ctx.actorUserId ?? null,
    organizationId: null,
    resourceType: "control_plane_tenant",
    resourceId: tenant.id,
    requestId: ctx.requestId,
    metadata: { client_slug: tenant.clientSlug, plan: tenant.plan },
  });
  await emitOperationEvent(repos, {
    tenantId: tenant.id,
    eventType: "tenant.created",
    severity: "success",
    message: `Tenant "${tenant.clientName}" (${tenant.clientSlug}) criado.`,
    metadata: { plan: tenant.plan },
    actorUserId: ctx.actorUserId ?? null,
  });

  return tenant;
}

// ---------------------------------------------------------------------------
// createPersistedInstallation
// ---------------------------------------------------------------------------

export async function createPersistedInstallation(
  repos: ControlPlaneRepositories,
  input: InstallationCreateInput,
  ctx: ControlPlaneActorContext = {},
): Promise<Installation> {
  assertSafePersistencePayload({ slug: input.slug, company: input.company, status: input.status }, "createPersistedInstallation.input");
  const installation = await repos.installations.createInstallation(input);

  await emitAudit(ctx, {
    action: "control_plane.installation_created",
    actorUserId: ctx.actorUserId ?? null,
    organizationId: null,
    resourceType: "control_plane_installation",
    resourceId: installation.id,
    requestId: ctx.requestId,
    metadata: { slug: installation.slug, status: installation.status, tenant_id: installation.tenant.id },
  });
  await emitOperationEvent(repos, {
    installationId: installation.id,
    tenantId: installation.tenant.id,
    eventType: "installation.created",
    severity: "success",
    message: `Instalação "${installation.company}" (${installation.slug}) criada.`,
    metadata: { status: installation.status },
    actorUserId: ctx.actorUserId ?? null,
  });

  return installation;
}

// ---------------------------------------------------------------------------
// recordDeployment
// ---------------------------------------------------------------------------

export async function recordDeployment(
  repos: ControlPlaneRepositories,
  input: RecordDeploymentInput,
  ctx: ControlPlaneActorContext = {},
): Promise<PersistedDeployment> {
  assertSafePersistencePayload(input.manifestSnapshot, "recordDeployment.manifestSnapshot");
  const deployment = await repos.deployments.recordDeployment(input);

  await emitAudit(ctx, {
    action: "control_plane.deployment_recorded",
    actorUserId: ctx.actorUserId ?? null,
    organizationId: null,
    resourceType: "control_plane_deployment",
    resourceId: deployment.id,
    requestId: ctx.requestId,
    metadata: { target: deployment.target, plan: deployment.plan, manifest_fingerprint: deployment.manifestFingerprint },
  });
  await emitOperationEvent(repos, {
    installationId: deployment.installationId,
    tenantId: deployment.tenantId,
    eventType: "deployment.recorded",
    severity: "info",
    message: `Manifesto de deployment gerado (fingerprint ${deployment.manifestFingerprint.slice(0, 12)}…).`,
    metadata: { target: deployment.target, plan: deployment.plan },
    actorUserId: ctx.actorUserId ?? null,
  });

  return deployment;
}

// ---------------------------------------------------------------------------
// createProvisioningRun
// ---------------------------------------------------------------------------

export async function createProvisioningRun(
  repos: ControlPlaneRepositories,
  input: CreateProvisioningRunInput,
  ctx: ControlPlaneActorContext = {},
): Promise<PersistedProvisioningRun> {
  const run = await repos.provisioning.createRun(input);

  await emitAudit(ctx, {
    action: "control_plane.provisioning_run_created",
    actorUserId: ctx.actorUserId ?? null,
    organizationId: null,
    resourceType: "control_plane_provisioning_run",
    resourceId: run.id,
    requestId: ctx.requestId,
    metadata: { status: run.status, plan: run.plan, target: run.target },
  });
  await emitOperationEvent(repos, {
    installationId: run.installationId,
    tenantId: run.tenantId,
    provisioningRunId: run.id,
    eventType: "provisioning_run.created",
    severity: "info",
    message: `Run de provisionamento criado (status: ${run.status}).`,
    metadata: { plan: run.plan, target: run.target },
    actorUserId: ctx.actorUserId ?? null,
  });

  return run;
}

// ---------------------------------------------------------------------------
// recordProvisioningStep
// ---------------------------------------------------------------------------

export async function recordProvisioningStep(
  repos: ControlPlaneRepositories,
  input: UpsertProvisioningStepInput,
  ctx: ControlPlaneActorContext = {},
): Promise<PersistedProvisioningStep> {
  const step = await repos.provisioning.upsertStep(input);

  // `PersistedProvisioningStep` não carrega installationId/tenantId (só
  // pertence a um run) — busca o run persistido pra propagar os dois no
  // operation event. Sem isso, `operationEvents.listByInstallation(...)`
  // nunca encontra o evento deste passo (era o Bug 1 desta feature).
  const run = await repos.provisioning.findRun(step.runId);
  if (!run) throw new ProvisioningRunNotFoundError(step.runId);

  await emitAudit(ctx, {
    action: "control_plane.provisioning_step_recorded",
    actorUserId: ctx.actorUserId ?? null,
    organizationId: null,
    resourceType: "control_plane_provisioning_step",
    resourceId: step.id,
    requestId: ctx.requestId,
    metadata: { run_id: step.runId, step_id: step.stepId, status: step.status },
  });
  await emitOperationEvent(repos, {
    installationId: run.installationId,
    tenantId: run.tenantId,
    provisioningRunId: step.runId,
    eventType: "provisioning_step.recorded",
    severity: step.status === "failed" ? "error" : "info",
    message: `Passo "${step.stepId}" registrado com status "${step.status}".`,
    metadata: { category: step.category, attempts: step.attempts },
    actorUserId: ctx.actorUserId ?? null,
  });

  return step;
}

// ---------------------------------------------------------------------------
// recordProviderConnection
// ---------------------------------------------------------------------------

export async function recordProviderConnection(
  repos: ControlPlaneRepositories,
  input: RecordProviderConnectionInput,
  ctx: ControlPlaneActorContext = {},
): Promise<PersistedProviderConnection> {
  assertSafePersistencePayload(input.config, "recordProviderConnection.config");
  const connection = await repos.providerConnections.recordConnection(input);

  await emitAudit(ctx, {
    action: "control_plane.provider_connection_recorded",
    actorUserId: ctx.actorUserId ?? null,
    organizationId: null,
    resourceType: "control_plane_provider_connection",
    resourceId: connection.id,
    requestId: ctx.requestId,
    metadata: { provider: connection.provider, mode: connection.mode, status: connection.status },
  });
  await emitOperationEvent(repos, {
    installationId: connection.installationId,
    eventType: "provider_connection.recorded",
    severity: "info",
    message: `Conexão com provider "${connection.provider}" registrada (mode: ${connection.mode}).`,
    metadata: { provider: connection.provider, status: connection.status },
    actorUserId: ctx.actorUserId ?? null,
  });

  return connection;
}

// ---------------------------------------------------------------------------
// recordSecretReference
// ---------------------------------------------------------------------------

export async function recordSecretReference(
  repos: ControlPlaneRepositories,
  input: CreateSecretReferenceInput,
  ctx: ControlPlaneActorContext = {},
): Promise<SecretReferenceMetadata> {
  assertSafePersistencePayload(input, "recordSecretReference.input");
  const secretReference = await repos.vault.createReference(input);

  // Metadata do audit/operation event É UM SUBCONJUNTO deliberado — nunca
  // `vaultKey` (mesmo sendo, por doutrina, sempre um ponteiro opaco nunca o
  // segredo em si, log de auditoria não precisa dele: menos superfície é
  // sempre melhor pra um log que fica retido 5 anos).
  await emitAudit(ctx, {
    action: "control_plane.secret_reference_created",
    actorUserId: ctx.actorUserId ?? null,
    organizationId: null,
    resourceType: "control_plane_secret_reference",
    resourceId: secretReference.id,
    requestId: ctx.requestId,
    metadata: { type: secretReference.type, provider: secretReference.provider, vault_provider: secretReference.vaultProvider },
  });
  await emitOperationEvent(repos, {
    installationId: secretReference.installationId,
    tenantId: secretReference.tenantId,
    eventType: "secret_reference.created",
    severity: "success",
    message: `Referência de segredo "${secretReference.reference}" criada (${secretReference.type}/${secretReference.provider}).`,
    metadata: { type: secretReference.type, provider: secretReference.provider },
    actorUserId: ctx.actorUserId ?? null,
  });

  return secretReference;
}

// ---------------------------------------------------------------------------
// rotateSecretReference / revokeSecretReference — mutação de METADATA
// (version/status/rotatedAt/revokedAt em control_plane_secret_references).
// NUNCA tocam ciphertext/valor — isso é `vault/secret-value-service.ts`, que
// CHAMA estas duas funções pra metadata e o `SecretPayloadRepository`/
// `SecretEncryptionProvider` (Real Vault Backend) pra payload, na mesma
// operação de negócio. Existirem aqui (não só no repository) é o que
// garante que rotação/revogação de referência SEMPRE sai auditada nos dois
// logs, mesmo se chamada sem nunca escrever um valor novo (ex.: revogar uma
// referência `pending` que nunca teve segredo armazenado).
// ---------------------------------------------------------------------------

export async function rotateSecretReference(
  repos: ControlPlaneRepositories,
  secretReferenceId: string,
  ctx: ControlPlaneActorContext = {},
): Promise<SecretReferenceMetadata> {
  const secretReference = await repos.vault.rotateReference(secretReferenceId);

  await emitAudit(ctx, {
    action: "control_plane.secret_reference_rotated",
    actorUserId: ctx.actorUserId ?? null,
    organizationId: null,
    resourceType: "control_plane_secret_reference",
    resourceId: secretReference.id,
    requestId: ctx.requestId,
    metadata: { type: secretReference.type, provider: secretReference.provider, version: secretReference.version },
  });
  await emitOperationEvent(repos, {
    installationId: secretReference.installationId,
    tenantId: secretReference.tenantId,
    eventType: "secret_reference.rotated",
    severity: "success",
    message: `Referência de segredo "${secretReference.reference}" rotacionada — versão ${secretReference.version}.`,
    metadata: { type: secretReference.type, provider: secretReference.provider, version: secretReference.version },
    actorUserId: ctx.actorUserId ?? null,
  });

  return secretReference;
}

export async function revokeSecretReference(
  repos: ControlPlaneRepositories,
  secretReferenceId: string,
  ctx: ControlPlaneActorContext = {},
): Promise<SecretReferenceMetadata> {
  const secretReference = await repos.vault.revokeReference(secretReferenceId);

  await emitAudit(ctx, {
    action: "control_plane.secret_reference_revoked",
    actorUserId: ctx.actorUserId ?? null,
    organizationId: null,
    resourceType: "control_plane_secret_reference",
    resourceId: secretReference.id,
    requestId: ctx.requestId,
    metadata: { type: secretReference.type, provider: secretReference.provider },
  });
  await emitOperationEvent(repos, {
    installationId: secretReference.installationId,
    tenantId: secretReference.tenantId,
    eventType: "secret_reference.revoked",
    severity: "warning",
    message: `Referência de segredo "${secretReference.reference}" revogada.`,
    metadata: { type: secretReference.type, provider: secretReference.provider },
    actorUserId: ctx.actorUserId ?? null,
  });

  return secretReference;
}

// ---------------------------------------------------------------------------
// recordOperationEvent — para eventos que não nascem de uma das 6 mutações
// acima (ex.: transição de status observada por um worker futuro).
// ---------------------------------------------------------------------------

export async function recordOperationEvent(
  repos: ControlPlaneRepositories,
  input: RecordOperationEventInput,
  ctx: ControlPlaneActorContext = {},
): Promise<PersistedOperationEvent> {
  const metadata = input.metadata ?? {};
  assertSafePersistencePayload(metadata, "recordOperationEvent.metadata");
  const event = await emitOperationEvent(repos, { ...input, actorUserId: ctx.actorUserId ?? input.actorUserId ?? null });

  await emitAudit(ctx, {
    action: "control_plane.operation_event_recorded",
    actorUserId: ctx.actorUserId ?? null,
    organizationId: null,
    resourceType: "control_plane_operation_event",
    resourceId: event.id,
    requestId: ctx.requestId,
    metadata: { event_type: event.eventType, severity: event.severity },
  });

  return event;
}
