/**
 * Erros da Provider Credentials Runtime — mesmo padrão flat do resto do
 * repo (`extends Error` direto, `this.name` em `snake_case`, campos
 * estruturados `public readonly`, sem classe base compartilhada — ver
 * `VaultReferenceNotFoundError`, `RealProvisioningDisabledError`,
 * `CredentialUnavailableError` em `lib/ai/credentials.ts`). Nenhum erro
 * aqui carrega valor de segredo na mensagem ou em campo.
 */

export class ProviderCredentialRequestInvalidError extends Error {
  constructor(public readonly errors: string[]) {
    super(`provider_credential_request_invalid: ${errors.join("; ")}`);
    this.name = "ProviderCredentialRequestInvalidError";
  }
}

/**
 * Lançado sempre que a policy nega acesso — default é SEMPRE deny, então
 * este é o caminho comum de recusa, não uma exceção rara.
 */
export class ProviderCredentialAccessDeniedError extends Error {
  constructor(
    public readonly reason: string,
    public readonly blockers: string[],
  ) {
    super(`provider_credential_access_denied: ${reason} — ${blockers.join("; ")}`);
    this.name = "ProviderCredentialAccessDeniedError";
  }
}

export type SecretResolutionFailureReason =
  | "reference_not_found"
  | "reference_revoked"
  | "reference_inactive"
  | "wrong_tenant"
  | "wrong_installation"
  | "provider_mismatch"
  | "vault_provider_unavailable"
  | "vault_provider_not_found"
  | "decrypt_failed";

export class SecretResolutionFailedError extends Error {
  constructor(
    public readonly reason: SecretResolutionFailureReason,
    message: string,
  ) {
    super(`secret_resolution_failed: ${reason} — ${message}`);
    this.name = "SecretResolutionFailedError";
  }
}

export class RuntimeVaultProviderNotFoundError extends Error {
  constructor(public readonly vaultProvider: string) {
    super(`runtime_vault_provider_not_found: nenhum RuntimeVaultProvider registrado suporta "${vaultProvider}"`);
    this.name = "RuntimeVaultProviderNotFoundError";
  }
}

export class RuntimeVaultProviderAlreadyRegisteredError extends Error {
  constructor(public readonly id: string) {
    super(`runtime_vault_provider_already_registered: "${id}" já está registrado neste registry`);
    this.name = "RuntimeVaultProviderAlreadyRegisteredError";
  }
}

export class CredentialLeaseNotFoundError extends Error {
  constructor(public readonly leaseId: string) {
    super(`credential_lease_not_found: ${leaseId}`);
    this.name = "CredentialLeaseNotFoundError";
  }
}

export class CredentialLeaseInvalidTransitionError extends Error {
  constructor(
    public readonly leaseId: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`credential_lease_invalid_transition: lease ${leaseId} não pode ir de "${from}" para "${to}"`);
    this.name = "CredentialLeaseInvalidTransitionError";
  }
}

/**
 * Lançado pelo runtime boundary (`withProviderCredential`) quando o
 * callback tenta devolver o `ResolvedCredential` (ou um objeto que o
 * contém em qualquer profundidade) como resultado da operação — a
 * credencial nunca pode escapar do callback. Fail-closed: a operação
 * inteira falha, não só o vazamento é mascarado.
 */
export class CredentialEscapeAttemptError extends Error {
  constructor(public readonly correlationId: string) {
    super(
      `credential_escape_attempt: o callback de withProviderCredential tentou retornar a credencial resolvida (correlationId=${correlationId}) — bloqueado, fail-closed`,
    );
    this.name = "CredentialEscapeAttemptError";
  }
}

/**
 * Lançado por `assertNoCredentialLeak` quando um summary/log/audit payload
 * carrega uma chave sensível OU um `ResolvedCredential` embutido — nunca
 * mascara silenciosamente (mesma doutrina de `UnsafePersistencePayloadError`).
 */
export class CredentialLeakDetectedError extends Error {
  constructor(
    public readonly context: string,
    public readonly offendingPaths: string[],
  ) {
    super(
      `credential_leak_detected: "${context}" contém campo(s)/objeto(s) sensível(is) em [${offendingPaths.join(", ")}] — bloqueado, fail-closed`,
    );
    this.name = "CredentialLeakDetectedError";
  }
}
