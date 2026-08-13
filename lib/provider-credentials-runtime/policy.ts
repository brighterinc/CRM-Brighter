/**
 * `evaluateProviderCredentialAccess()` — policy engine da Provider
 * Credentials Runtime. Função PURA (sem I/O): quem chama (`resolver.ts`/
 * `runtime.ts`) já resolveu `secretReference`/`providerConnection`/
 * `installation` via os repositories reais/in-memory ANTES de chamar aqui —
 * este módulo só decide, nunca busca.
 *
 * Default = SEMPRE deny: `allowed` só vira `true` se TODAS as três
 * dependências foram encontradas (`secretReference`/`providerConnection`/
 * `installation` não-nulas) E nenhum blocker disparou. Ausência de dado
 * nunca vira aprovação por omissão.
 */
import type {
  ProviderCredentialPolicyDecision,
  ProviderCredentialPurpose,
  ProviderCredentialRequest,
  ProvisioningProvider,
  SecretReferenceMetadata,
  SecretReferenceType,
} from "./types";

/** Status de installation que bloqueiam qualquer acesso a credencial — decomissionada ou em erro nunca deveria estar resolvendo segredo. */
const BLOCKED_INSTALLATION_STATUSES = new Set(["archived", "error"]);

export type ProviderCredentialConnectionContext = {
  id: string;
  installationId: string;
  provider: ProvisioningProvider;
  status: string;
};

export type ProviderCredentialInstallationContext = {
  id: string;
  tenantId: string;
  status: string;
};

/** Requisito declarado pelo Provisioning Adapter pra esta operação — ver `adapter-integration.ts`. `null`/ausente = nenhum adapter declarou requisito pra esta operação. */
export type ProviderCredentialAdapterRequirement = {
  purpose: ProviderCredentialPurpose;
  secretType?: SecretReferenceType;
};

export type ProviderCredentialAccessContext = {
  request: ProviderCredentialRequest;
  secretReference: SecretReferenceMetadata | null;
  providerConnection: ProviderCredentialConnectionContext | null;
  installation: ProviderCredentialInstallationContext | null;
  adapterRequirement?: ProviderCredentialAdapterRequirement | null;
};

export function evaluateProviderCredentialAccess(context: ProviderCredentialAccessContext): ProviderCredentialPolicyDecision {
  const { request, secretReference, providerConnection, installation, adapterRequirement } = context;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!secretReference) {
    blockers.push("secret_reference_not_found");
  } else {
    if (secretReference.status !== "active") blockers.push(`secret_reference_not_active:${secretReference.status}`);

    const isPlatformWideSecret = secretReference.provider === "platform" && secretReference.tenantId === null && secretReference.installationId === null;

    if (!isPlatformWideSecret) {
      if (secretReference.provider !== request.provider) blockers.push("provider_mismatch");
      if (secretReference.tenantId !== null && secretReference.tenantId !== request.tenantId) blockers.push("cross_tenant_denied");
      if (secretReference.installationId !== null && secretReference.installationId !== request.installationId) {
        blockers.push("cross_installation_denied");
      }
    }
  }

  if (!providerConnection) {
    blockers.push("provider_connection_not_found");
  } else {
    if (providerConnection.provider !== request.provider) blockers.push("provider_connection_provider_mismatch");
    if (providerConnection.installationId !== request.installationId) blockers.push("provider_connection_installation_mismatch");
    if (providerConnection.status !== "available") blockers.push(`provider_connection_unavailable:${providerConnection.status}`);
  }

  if (!installation) {
    blockers.push("installation_not_found");
  } else {
    if (installation.tenantId !== request.tenantId) blockers.push("installation_tenant_mismatch");
    if (BLOCKED_INSTALLATION_STATUSES.has(installation.status)) blockers.push(`installation_blocked:${installation.status}`);
  }

  if (adapterRequirement) {
    if (adapterRequirement.purpose !== request.purpose) blockers.push("purpose_not_authorized");
    if (adapterRequirement.secretType && secretReference && adapterRequirement.secretType !== secretReference.type) {
      blockers.push("secret_type_mismatch");
    }
  } else {
    warnings.push("no_adapter_credential_requirement_declared");
  }

  const allowed = blockers.length === 0 && Boolean(secretReference) && Boolean(providerConnection) && Boolean(installation);

  const reason = allowed
    ? `acesso liberado — purpose "${request.purpose}", operation "${request.operation}"`
    : `acesso negado — ${blockers.length > 0 ? blockers.join(", ") : "dependências não resolvidas"}`;

  return {
    allowed,
    blockers,
    warnings,
    reason,
    auditMetadata: {
      provider: request.provider,
      purpose: request.purpose,
      operation: request.operation,
      blockers_count: blockers.length,
      warnings_count: warnings.length,
    },
  };
}
