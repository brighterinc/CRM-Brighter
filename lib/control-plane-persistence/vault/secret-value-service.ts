/**
 * Orquestração das operações que TOCAM plaintext pra ESCRITA —
 * `storeSecretValue`/`rotateSecretValue`/`revokeSecretValue`. Único módulo
 * autorizado a receber plaintext como parâmetro de entrada nesta camada
 * (o único outro é o boundary de LEITURA, `withProviderCredential`/
 * `ResolvedCredential`, em `lib/provider-credentials-runtime/`).
 *
 * Deliberadamente SEPARADO de `../services.ts` (que orquestra as mutações
 * de METADATA — `recordSecretReference`/`rotateSecretReference`/
 * `revokeSecretReference` — e nunca deve ver plaintext/ciphertext). Este
 * módulo CHAMA aquelas funções pra metadata e usa `SecretPayloadRepository`
 * + `SecretEncryptionProvider` pra payload, na mesma operação de negócio —
 * mas os dois lados nunca se misturam numa função só de `services.ts`.
 *
 * `recordSecretUsage` fica FORA das outras três de propósito: nunca lança,
 * nunca bloqueia uma resolução bem-sucedida, e não gera `api_audit_log`
 * (telemetria de alta frequência — cada resolução de credencial chamaria
 * isto; um log de auditoria retido 5 anos não precisa de uma linha por
 * resolução). Ver `docs/vault-backend/lifecycle.md`.
 */
import { VaultReferenceNotFoundError } from "./types";
import {
  revokeSecretReference,
  rotateSecretReference,
  type AuditEmitInput,
  type AuditEmitter,
  type ControlPlaneActorContext,
} from "../services";
import type { ControlPlaneRepositories } from "../repositories/factory";
import { assertSafePersistencePayload } from "../safe-persistence";
import type { SecretReferenceMetadata } from "../types";

import type { SecretEncryptionProvider } from "./encryption";
import type { SecretCiphertextVersionMetadata, SecretPayloadRepository } from "./secret-payload";

export type SecretValueServiceDeps = {
  payloadRepository: SecretPayloadRepository;
  encryptionProvider: SecretEncryptionProvider;
};

/** Só importa `@/lib/audit` quando de fato chamada — mesma cautela de `services.ts::defaultAuditEmitter`. */
const defaultAuditEmitter: AuditEmitter = async (entry) => {
  const { audit } = await import("@/lib/audit");
  await audit(entry);
};

async function emitAudit(ctx: ControlPlaneActorContext, entry: AuditEmitInput): Promise<void> {
  await (ctx.emitAudit ?? defaultAuditEmitter)(entry);
}

async function requireReference(repos: ControlPlaneRepositories, secretReferenceId: string): Promise<SecretReferenceMetadata> {
  const reference = await repos.vault.resolveReferenceMetadata(secretReferenceId);
  if (!reference) throw new VaultReferenceNotFoundError(secretReferenceId);
  return reference;
}

// ---------------------------------------------------------------------------
// storeSecretValue — PRIMEIRA escrita de valor pra uma reference já criada
// (via `recordSecretReference`, `../services.ts`). `reference.version`
// continua 1 depois desta chamada — armazenar o primeiro valor não é
// rotação.
// ---------------------------------------------------------------------------

export async function storeSecretValue(
  repos: ControlPlaneRepositories,
  deps: SecretValueServiceDeps,
  secretReferenceId: string,
  plaintext: string,
  ctx: ControlPlaneActorContext = {},
): Promise<SecretCiphertextVersionMetadata> {
  const reference = await requireReference(repos, secretReferenceId);

  const encrypted = await deps.encryptionProvider.encrypt(plaintext);
  const versionMetadata = await deps.payloadRepository.writeVersion(secretReferenceId, encrypted);

  await emitAudit(ctx, {
    action: "control_plane.secret_value_stored",
    actorUserId: ctx.actorUserId ?? null,
    organizationId: null,
    resourceType: "control_plane_secret_reference",
    resourceId: reference.id,
    requestId: ctx.requestId,
    metadata: { type: reference.type, provider: reference.provider, version: versionMetadata.version, encryption_scheme: versionMetadata.encryptionScheme },
  });
  const eventMetadata = { version: versionMetadata.version, encryption_scheme: versionMetadata.encryptionScheme };
  assertSafePersistencePayload(eventMetadata, "storeSecretValue.eventMetadata");
  await repos.operationEvents.recordEvent({
    installationId: reference.installationId,
    tenantId: reference.tenantId,
    eventType: "secret_value.stored",
    severity: "success",
    message: `Valor armazenado pra referência "${reference.reference}" — versão ${versionMetadata.version}.`,
    metadata: eventMetadata,
    actorUserId: ctx.actorUserId ?? null,
  });

  return versionMetadata;
}

// ---------------------------------------------------------------------------
// rotateSecretValue — supersede a versão ativa, escreve uma nova, E garante
// que `control_plane_secret_references.version`/`rotated_at` acompanham —
// nunca uma reference com `version: 2` e só ciphertext v1 (isso é STALE,
// exatamente o que `PostgresPgcryptoRuntimeVaultProvider` recusa via
// `SecretVersionStaleError`).
//
// O backend REAL (`fn_vault_write_secret_version`, migration 0099) já bumpa
// `version`/`status`/`rotated_at` na MESMA transação `SELECT ... FOR UPDATE`
// que escreve o ciphertext — chamar `rotateSecretReference()` (que faz um
// `UPDATE version = existing.version + 1` NÃO atômico, lido em JS antes de
// escrever) de novo aqui DUPLICARIA o incremento e reintroduziria exatamente
// a race que a função SQL evita. Por isso só chamamos `rotateSecretReference`
// se a metadata AINDA não refletir a versão que acabou de ser escrita — ou
// seja, quando o `SecretPayloadRepository` injetado (ex.:
// `InMemorySecretPayloadRepository`, usado em teste/simulação) não tem essa
// responsabilidade embutida.
// ---------------------------------------------------------------------------

export async function rotateSecretValue(
  repos: ControlPlaneRepositories,
  deps: SecretValueServiceDeps,
  secretReferenceId: string,
  newPlaintext: string,
  ctx: ControlPlaneActorContext = {},
): Promise<{ reference: SecretReferenceMetadata; version: SecretCiphertextVersionMetadata }> {
  await requireReference(repos, secretReferenceId);

  const encrypted = await deps.encryptionProvider.encrypt(newPlaintext);
  const versionMetadata = await deps.payloadRepository.writeVersion(secretReferenceId, encrypted);

  let reference = await requireReference(repos, secretReferenceId);
  if (reference.version !== versionMetadata.version) {
    reference = await rotateSecretReference(repos, secretReferenceId, ctx);
  }

  await emitAudit(ctx, {
    action: "control_plane.secret_value_rotated",
    actorUserId: ctx.actorUserId ?? null,
    organizationId: null,
    resourceType: "control_plane_secret_reference",
    resourceId: reference.id,
    requestId: ctx.requestId,
    metadata: { type: reference.type, provider: reference.provider, version: versionMetadata.version },
  });
  const eventMetadata = { version: versionMetadata.version, encryption_scheme: versionMetadata.encryptionScheme };
  assertSafePersistencePayload(eventMetadata, "rotateSecretValue.eventMetadata");
  await repos.operationEvents.recordEvent({
    installationId: reference.installationId,
    tenantId: reference.tenantId,
    eventType: "secret_value.rotated",
    severity: "success",
    message: `Valor rotacionado pra referência "${reference.reference}" — nova versão ${versionMetadata.version}.`,
    metadata: eventMetadata,
    actorUserId: ctx.actorUserId ?? null,
  });

  return { reference, version: versionMetadata };
}

// ---------------------------------------------------------------------------
// revokeSecretValue — marca a referência revogada (metadata) E a versão de
// ciphertext ativa revogada (payload). Terminal — nenhuma versão nova pode
// ser escrita depois pra esta reference (quem quiser um segredo novo cria
// uma reference nova via `recordSecretReference`).
// ---------------------------------------------------------------------------

export async function revokeSecretValue(
  repos: ControlPlaneRepositories,
  deps: SecretValueServiceDeps,
  secretReferenceId: string,
  ctx: ControlPlaneActorContext = {},
): Promise<SecretReferenceMetadata> {
  await requireReference(repos, secretReferenceId);

  const reference = await revokeSecretReference(repos, secretReferenceId, ctx);
  await deps.payloadRepository.revokeActiveVersion(secretReferenceId);

  await emitAudit(ctx, {
    action: "control_plane.secret_value_revoked",
    actorUserId: ctx.actorUserId ?? null,
    organizationId: null,
    resourceType: "control_plane_secret_reference",
    resourceId: reference.id,
    requestId: ctx.requestId,
    metadata: { type: reference.type, provider: reference.provider },
  });
  await repos.operationEvents.recordEvent({
    installationId: reference.installationId,
    tenantId: reference.tenantId,
    eventType: "secret_value.revoked",
    severity: "warning",
    message: `Valor revogado pra referência "${reference.reference}".`,
    metadata: { type: reference.type, provider: reference.provider },
    actorUserId: ctx.actorUserId ?? null,
  });

  return reference;
}

// ---------------------------------------------------------------------------
// recordSecretUsage — telemetria fire-and-forget, ver doc do módulo.
// ---------------------------------------------------------------------------

export async function recordSecretUsage(repos: ControlPlaneRepositories, secretReferenceId: string): Promise<void> {
  await repos.secretUsage.recordUsage(secretReferenceId).catch(() => {});
}
