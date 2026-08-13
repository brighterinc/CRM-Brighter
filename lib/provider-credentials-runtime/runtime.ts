/**
 * `withProviderCredential()` — o runtime execution boundary. Único ponto de
 * entrada pra qualquer código (adapter fake, futuro adapter real) obter uma
 * credencial resolvida. Fluxo (ver `docs/provider-credentials-runtime/runtime-boundary.md`):
 *
 *   1. valida a forma do request (`validation.ts`)
 *   2. audita `credential_access_requested`
 *   3. resolve metadata da secret reference + provider connection +
 *      installation (dependências injetadas — nunca I/O direto aqui)
 *   4. avalia policy (`policy.ts`) — nega fail-closed, audita
 *      `credential_access_denied` e lança se negado
 *   5. cria a lease (`created`)
 *   6. ativa a lease, resolve o valor de verdade (`resolver.ts`), audita
 *      `credential_resolved`
 *   7. entrega o `ResolvedCredential` ao callback
 *   8. callback executa a operação (fake/noop nesta fase)
 *   9. detecta tentativa de escape — se o retorno do callback CONTÉM o
 *      `ResolvedCredential` em qualquer profundidade, lança
 *      `CredentialEscapeAttemptError` (fail-closed, nunca deixa passar)
 *   10. consome a lease, audita `credential_consumed`
 *   11. em `finally`: zera o buffer do credential, libera a lease (idempotente),
 *       audita `credential_released` só se a liberação de fato mudou o
 *       estado (evita evento enganoso quando a lease já terminou em `failed`)
 *
 * A credencial NUNCA é retornada por esta função — só o resultado do
 * callback (`T`), e mesmo esse resultado é varrido em busca de um
 * `ResolvedCredential` embutido antes de sair.
 */
import type { CredentialsVault } from "@/lib/control-plane-persistence/vault/types";

import { recordProviderCredentialAuditEvent, type ProviderCredentialAuditSink } from "./audit";
import { CredentialEscapeAttemptError, ProviderCredentialAccessDeniedError, ProviderCredentialRequestInvalidError } from "./errors";
import { activateCredentialLease, consumeCredentialLease, createCredentialLease, failCredentialLease, releaseCredentialLease } from "./lease";
import {
  evaluateProviderCredentialAccess,
  type ProviderCredentialAdapterRequirement,
  type ProviderCredentialConnectionContext,
  type ProviderCredentialInstallationContext,
} from "./policy";
import { resolveProviderCredential } from "./resolver";
import type { CredentialLeaseRepository } from "./repository";
import type { RuntimeVaultProviderRegistry } from "./registry";
import { containsResolvedCredential, type ProviderCredentialRequest, type ProvisioningProvider, type ResolvedCredential } from "./types";
import { validateProviderCredentialRequest } from "./validation";

export type WithProviderCredentialDeps = {
  vault: CredentialsVault;
  vaultProviderRegistry: RuntimeVaultProviderRegistry;
  leaseRepository: CredentialLeaseRepository;
  auditSink: ProviderCredentialAuditSink;
  loadProviderConnection: (installationId: string, provider: ProvisioningProvider) => Promise<ProviderCredentialConnectionContext | null>;
  loadInstallation: (installationId: string) => Promise<ProviderCredentialInstallationContext | null>;
  loadAdapterRequirement?: (provider: ProvisioningProvider, operation: string) => ProviderCredentialAdapterRequirement | null;
};

async function auditEvent(
  deps: WithProviderCredentialDeps,
  request: ProviderCredentialRequest,
  input: Omit<Parameters<typeof recordProviderCredentialAuditEvent>[1], "installationId" | "tenantId" | "actorUserId">,
): Promise<void> {
  await recordProviderCredentialAuditEvent(deps.auditSink, {
    ...input,
    installationId: request.installationId,
    tenantId: request.tenantId,
    actorUserId: request.requestedBy ?? null,
  });
}

export async function withProviderCredential<T>(
  deps: WithProviderCredentialDeps,
  request: ProviderCredentialRequest,
  callback: (credential: ResolvedCredential) => Promise<T> | T,
): Promise<T> {
  const structuralValidation = validateProviderCredentialRequest(request);
  if (!structuralValidation.valid) throw new ProviderCredentialRequestInvalidError(structuralValidation.errors);

  await auditEvent(deps, request, {
    eventType: "credential_access_requested",
    severity: "info",
    message: `Acesso solicitado — provider "${request.provider}", purpose "${request.purpose}", operation "${request.operation}".`,
    metadata: { provider: request.provider, purpose: request.purpose, operation: request.operation, correlation_id: request.correlationId },
  });

  const secretReference = await deps.vault.resolveReferenceMetadata(request.secretReferenceId).catch(() => null);
  const [providerConnection, installation] = await Promise.all([
    deps.loadProviderConnection(request.installationId, request.provider),
    deps.loadInstallation(request.installationId),
  ]);
  const adapterRequirement = deps.loadAdapterRequirement?.(request.provider, request.operation) ?? null;

  const decision = evaluateProviderCredentialAccess({ request, secretReference, providerConnection, installation, adapterRequirement });

  if (!decision.allowed) {
    await auditEvent(deps, request, {
      eventType: "credential_access_denied",
      severity: "warning",
      message: decision.reason,
      metadata: decision.auditMetadata,
    });
    throw new ProviderCredentialAccessDeniedError(decision.reason, decision.blockers);
  }

  const singleUse = request.singleUse ?? true;
  const lease = await createCredentialLease(deps.leaseRepository, {
    tenantId: request.tenantId,
    installationId: request.installationId,
    provider: request.provider,
    secretReferenceId: request.secretReferenceId,
    purpose: request.purpose,
    operation: request.operation,
    singleUse,
    correlationId: request.correlationId,
    requestedBy: request.requestedBy ?? null,
  });

  await auditEvent(deps, request, {
    eventType: "credential_lease_created",
    severity: "info",
    message: `Lease ${lease.id} criada (singleUse: ${singleUse}).`,
    metadata: { lease_id: lease.id, single_use: singleUse },
  });

  let credential: ResolvedCredential | null = null;
  try {
    await activateCredentialLease(deps.leaseRepository, lease.id);

    credential = await resolveProviderCredential(
      { vault: deps.vault, vaultProviderRegistry: deps.vaultProviderRegistry },
      request.secretReferenceId,
      { singleUse },
    );

    await auditEvent(deps, request, {
      eventType: "credential_resolved",
      severity: "success",
      message: `Credencial resolvida — vault provider "${credential.metadata.vaultProvider}".`,
      // Chave deliberadamente `type`, nunca `secret_type` — `SENSITIVE_KEY_PATTERN`
      // (`lib/tenants/export.ts`, reusada por `assertNoCredentialLeak`) casa
      // qualquer chave que CONTENHA "secret", então um nome de campo com esse
      // substring seria removido/rejeitado mesmo carregando só um enum
      // inofensivo (`SecretReferenceType`, nunca o valor em si).
      metadata: { lease_id: lease.id, vault_provider: credential.metadata.vaultProvider, type: credential.metadata.secretType },
    });

    const result = await callback(credential);

    if (containsResolvedCredential(result)) {
      throw new CredentialEscapeAttemptError(request.correlationId);
    }

    await consumeCredentialLease(deps.leaseRepository, lease.id);
    await auditEvent(deps, request, {
      eventType: "credential_consumed",
      severity: "info",
      message: `Lease ${lease.id} consumida.`,
      metadata: { lease_id: lease.id },
    });

    return result;
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    await failCredentialLease(deps.leaseRepository, lease.id, failureReason);
    await auditEvent(deps, request, {
      eventType: "credential_failed",
      severity: "error",
      message: `Operação falhou: ${failureReason}`,
      metadata: { lease_id: lease.id },
    });
    throw error;
  } finally {
    credential?.release();
    const releasedLease = await releaseCredentialLease(deps.leaseRepository, lease.id);
    if (releasedLease.status === "released") {
      await auditEvent(deps, request, {
        eventType: "credential_released",
        severity: "info",
        message: `Lease ${lease.id} liberada.`,
        metadata: { lease_id: lease.id },
      });
    }
  }
}
