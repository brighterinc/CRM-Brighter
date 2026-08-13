/**
 * `InMemoryRuntimeVaultProvider` — demonstração/teste, mesma doutrina das
 * *Foundation* in-memory já existentes (`InMemoryCredentialsVault` etc):
 * `Map` privado por instância, nunca singleton global, nunca persiste em
 * disco/rede. Guarda um valor FAKE por `secretReferenceId` — quem chama
 * semeia via `.seed()` antes de resolver (nunca lê de fonte real nenhuma).
 * Suporta só `vaultProvider: "in_memory"`.
 */
import { SecretResolutionFailedError } from "../errors";
import {
  ResolvedCredential,
  type ResolveSecretOptions,
  type RuntimeVaultProvider,
  type RuntimeVaultProviderHealth,
  type SecretReferenceMetadata,
  type VaultProvider,
} from "../types";

export class InMemoryRuntimeVaultProvider implements RuntimeVaultProvider {
  readonly id = "in_memory" as const;

  private readonly values = new Map<string, string>();

  supports(vaultProvider: VaultProvider): boolean {
    return vaultProvider === "in_memory";
  }

  /** Semeia um valor FAKE pra uma `secretReferenceId` — só pra teste/CLI/simulação. */
  seed(secretReferenceId: string, value: string): void {
    this.values.set(secretReferenceId, value);
  }

  unseed(secretReferenceId: string): void {
    this.values.delete(secretReferenceId);
  }

  clear(): void {
    this.values.clear();
  }

  async resolveSecret(reference: SecretReferenceMetadata, options: ResolveSecretOptions): Promise<ResolvedCredential> {
    const value = this.values.get(reference.id);
    if (value === undefined) {
      throw new SecretResolutionFailedError(
        "reference_not_found",
        `InMemoryRuntimeVaultProvider não tem valor semeado pra reference ${reference.id} — chame .seed() antes (teste/simulação)`,
      );
    }
    return new ResolvedCredential(
      value,
      {
        secretReferenceId: reference.id,
        provider: reference.provider,
        secretType: reference.type,
        vaultProvider: reference.vaultProvider,
        version: reference.version,
      },
      options.singleUse,
    );
  }

  async validateReference(reference: SecretReferenceMetadata): Promise<{ valid: boolean; errors: string[] }> {
    if (!this.values.has(reference.id)) return { valid: false, errors: [`nenhum valor semeado pra reference ${reference.id}`] };
    return { valid: true, errors: [] };
  }

  async healthPreview(): Promise<RuntimeVaultProviderHealth> {
    return { id: this.id, available: true, message: `In-memory — ${this.values.size} valor(es) fake semeado(s) nesta instância.` };
  }
}
