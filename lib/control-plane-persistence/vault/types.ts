/**
 * Contrato do Credentials Vault — gerencia REFERÊNCIAS de segredo, nunca o
 * valor. Nenhuma implementação desta fase (`NoopCredentialsVault`,
 * `InMemoryCredentialsVault`, `DatabaseSecretReferenceRepository`) ganha um
 * `getSecretValue()` — essa operação simplesmente não existe na interface,
 * de propósito: se o valor nunca pode ser lido pelo domínio, não tem como um
 * chamador de boa-fé vazá-lo sem querer. Ver
 * `docs/control-plane-persistence/credentials-vault.md`.
 */
import type { SecretReferenceMetadata, SecretReferenceProvider, SecretReferenceType, VaultProvider } from "../types";

export type CreateSecretReferenceInput = {
  installationId?: string | null;
  tenantId?: string | null;
  /** Id opaco pelo qual quem chama vai reconhecer esta referência depois (não é o segredo). */
  reference: string;
  type: SecretReferenceType;
  provider: SecretReferenceProvider;
  vaultProvider: VaultProvider;
  /** Ponteiro opaco DENTRO do vault (ex.: caminho/ARN) — nunca o segredo em si. */
  vaultKey: string;
};

export class VaultReferenceNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`vault_reference_not_found: ${id}`);
    this.name = "VaultReferenceNotFoundError";
  }
}

export class VaultDisabledError extends Error {
  constructor(operation: string) {
    super(`vault_disabled: operação "${operation}" não está disponível neste vault (Noop) — configure um vaultProvider real antes de usar credenciais de verdade`);
    this.name = "VaultDisabledError";
  }
}

export interface CredentialsVault {
  createReference(input: CreateSecretReferenceInput): Promise<SecretReferenceMetadata>;
  resolveReferenceMetadata(id: string): Promise<SecretReferenceMetadata | null>;
  rotateReference(id: string): Promise<SecretReferenceMetadata>;
  revokeReference(id: string): Promise<SecretReferenceMetadata>;
  validateReference(id: string): Promise<{ valid: boolean; errors: string[] }>;
}

/**
 * Listagem de metadata por installation — deliberadamente FORA de
 * `CredentialsVault` (que fica minimalista, sem nenhuma operação de leitura
 * em massa). Existe só pra admin UI (`/app/settings/control-plane/persistence`)
 * listar referências sem precisar de um repository genérico novo. As duas
 * implementações concretas do vault (`InMemoryCredentialsVault`,
 * `DatabaseSecretReferenceRepository`) implementam as duas interfaces no
 * MESMO objeto — a factory expõe o mesmo instance via `repos.vault` (tipado
 * `CredentialsVault`) e `repos.secretReferences` (tipado `SecretReferenceReader`),
 * nunca duas instâncias/dois estados.
 */
export interface SecretReferenceReader {
  listByInstallation(installationId: string): Promise<SecretReferenceMetadata[]>;
}

/**
 * `recordUsage` — bump de `lastUsedAt`, deliberadamente FORA de
 * `CredentialsVault` (mesmo espírito de `SecretReferenceReader`): não é uma
 * mutação de negócio (não muda `version`/`status`), é telemetria de runtime
 * chamada em TODA resolução bem-sucedida (`PostgresPgcryptoRuntimeVaultProvider`,
 * via `vault/secret-value-service.ts`) — misturar na interface principal
 * poluiria o contrato que toda UI/CLI usa pra metadata "de negócio". As duas
 * implementações concretas do vault expõem a MESMA instância via
 * `repos.vault`/`repos.secretUsage` (nunca duas instâncias/dois estados) —
 * mesmo padrão de `repos.vault`/`repos.secretReferences`.
 */
export interface SecretUsageRecorder {
  /** Nunca lança se a reference não existir — silenciosamente não-op (fire-and-forget por natureza, nunca deve derrubar uma resolução bem-sucedida). */
  recordUsage(id: string): Promise<void>;
}

export type { SecretReferenceMetadata, SecretReferenceProvider, SecretReferenceType, VaultProvider };
