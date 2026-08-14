/**
 * Erros do Real Vault Backend — mesmo padrão flat do resto do repo
 * (`extends Error` direto, `this.name` em `snake_case`, campos
 * `public readonly`). Nenhum erro aqui carrega plaintext, ciphertext ou
 * chave mestra — nem na mensagem, nem em campo.
 */

export class RealVaultBackendDisabledError extends Error {
  constructor(public readonly operation: string) {
    super(
      `real_vault_backend_disabled: operação "${operation}" recusada — REAL_VAULT_BACKEND_ENABLED não é "true" (default seguro, fail-closed)`,
    );
    this.name = "RealVaultBackendDisabledError";
  }
}

export class SecretVersionNotFoundError extends Error {
  constructor(public readonly secretReferenceId: string) {
    super(`secret_version_not_found: nenhuma versão ativa pra secret reference ${secretReferenceId}`);
    this.name = "SecretVersionNotFoundError";
  }
}

export class SecretVersionStaleError extends Error {
  constructor(
    public readonly secretReferenceId: string,
    public readonly metadataVersion: number,
    public readonly payloadVersion: number,
  ) {
    super(
      `secret_version_stale: metadata da reference ${secretReferenceId} aponta pra versão ${metadataVersion}, mas o payload ativo está na versão ${payloadVersion} — resolução recusada, fail-closed`,
    );
    this.name = "SecretVersionStaleError";
  }
}
