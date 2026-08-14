/**
 * `PostgresPgcryptoRuntimeVaultProvider` — o PRIMEIRO `RuntimeVaultProvider`
 * REAL desta camada. Suporta só `vaultProvider: "postgres_pgcrypto"`.
 *
 * Nunca cifra/decifra sozinho — delega pra `SecretPayloadRepository`
 * (`lib/control-plane-persistence/vault/secret-payload.ts`, busca o
 * ciphertext ativo) e `SecretEncryptionProvider`
 * (`lib/control-plane-persistence/vault/encryption.ts`, decifra). Este
 * provider só ORQUESTRA os dois dentro do contrato `RuntimeVaultProvider` —
 * mesma separação de responsabilidade que `resolver.ts` já impõe entre
 * `CredentialsVault` (metadata) e `RuntimeVaultProvider` (valor).
 *
 * Verificação de VERSÃO: a versão do ciphertext ativo (`SecretPayloadRepository`)
 * DEVE bater com `reference.version` (`SecretReferenceMetadata`, já
 * resolvida por `CredentialsVault` ANTES de chegar aqui) — se divergir, a
 * reference está STALE (alguém rotacionou o payload sem que a metadata
 * refletisse, ou vice-versa) e a resolução é recusada fail-closed
 * (`SecretVersionStaleError`), nunca "usa a que achar".
 *
 * `recordUsage` é fire-and-forget (nunca bloqueia nem falha a resolução —
 * mesma doutrina de audit ≤500ms p99 do CLAUDE.md) — atualiza
 * `control_plane_secret_references.last_used_at`.
 *
 * NUNCA registrado em `createDefaultRuntimeVaultProviderRegistry()`
 * (`./index.ts`) — mesmo precedente do Real Supabase Adapter não estar no
 * registry default de adapters: quem quer o backend real monta a própria
 * instância via `createPostgresPgcryptoRuntimeVaultProvider(deps)` e
 * registra explicitamente.
 */
import type { SecretEncryptionProvider } from "@/lib/control-plane-persistence/vault/encryption";
import { SecretVersionStaleError } from "@/lib/control-plane-persistence/vault/errors";
import type { SecretPayloadRepository } from "@/lib/control-plane-persistence/vault/secret-payload";

import { SecretResolutionFailedError } from "../errors";
import {
  ResolvedCredential,
  type ResolveSecretOptions,
  type RuntimeVaultProvider,
  type RuntimeVaultProviderHealth,
  type SecretReferenceMetadata,
  type VaultProvider,
} from "../types";

export type PostgresPgcryptoRuntimeVaultProviderOptions = {
  payloadRepository: SecretPayloadRepository;
  encryptionProvider: SecretEncryptionProvider;
  /** Fire-and-forget — nunca lança, nunca bloqueia `resolveSecret`. */
  recordUsage?: (secretReferenceId: string) => Promise<void>;
};

export class PostgresPgcryptoRuntimeVaultProvider implements RuntimeVaultProvider {
  readonly id = "postgres_pgcrypto" as const;

  private readonly payloadRepository: SecretPayloadRepository;
  private readonly encryptionProvider: SecretEncryptionProvider;
  private readonly recordUsage?: (secretReferenceId: string) => Promise<void>;

  constructor(options: PostgresPgcryptoRuntimeVaultProviderOptions) {
    this.payloadRepository = options.payloadRepository;
    this.encryptionProvider = options.encryptionProvider;
    this.recordUsage = options.recordUsage;
  }

  supports(vaultProvider: VaultProvider): boolean {
    return vaultProvider === "postgres_pgcrypto";
  }

  async resolveSecret(reference: SecretReferenceMetadata, options: ResolveSecretOptions): Promise<ResolvedCredential> {
    const activeVersion = await this.payloadRepository.getActiveCiphertext(reference.id);
    if (!activeVersion) {
      throw new SecretResolutionFailedError("reference_not_found", `nenhum ciphertext ativo pra reference ${reference.id}`);
    }
    if (activeVersion.version !== reference.version) {
      throw new SecretVersionStaleError(reference.id, reference.version, activeVersion.version);
    }

    let plaintext: string;
    try {
      plaintext = await this.encryptionProvider.decrypt(activeVersion);
    } catch (error) {
      throw new SecretResolutionFailedError("decrypt_failed", error instanceof Error ? error.message : String(error));
    }

    const credential = new ResolvedCredential(
      plaintext,
      {
        secretReferenceId: reference.id,
        provider: reference.provider,
        secretType: reference.type,
        vaultProvider: reference.vaultProvider,
        version: reference.version,
      },
      options.singleUse,
    );

    if (this.recordUsage) {
      void this.recordUsage(reference.id).catch(() => {});
    }

    return credential;
  }

  async validateReference(reference: SecretReferenceMetadata): Promise<{ valid: boolean; errors: string[] }> {
    const activeVersion = await this.payloadRepository.getActiveCiphertext(reference.id);
    if (!activeVersion) return { valid: false, errors: [`nenhum ciphertext ativo pra reference ${reference.id}`] };
    if (activeVersion.version !== reference.version) {
      return { valid: false, errors: [`versão do payload (${activeVersion.version}) diverge da metadata (${reference.version})`] };
    }
    return { valid: true, errors: [] };
  }

  async healthPreview(): Promise<RuntimeVaultProviderHealth> {
    const encryptionHealth = await this.encryptionProvider.healthPreview();
    return { id: this.id, available: encryptionHealth.available, message: `Postgres pgcrypto — ${encryptionHealth.message}` };
  }
}

export function createPostgresPgcryptoRuntimeVaultProvider(
  options: PostgresPgcryptoRuntimeVaultProviderOptions,
): PostgresPgcryptoRuntimeVaultProvider {
  return new PostgresPgcryptoRuntimeVaultProvider(options);
}
