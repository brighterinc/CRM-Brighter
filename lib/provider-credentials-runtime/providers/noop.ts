/**
 * `NoopRuntimeVaultProvider` — default explícito de "resolução de valor
 * desligada", mesma doutrina de `NoopCredentialsVault`
 * (`lib/control-plane-persistence/vault/noop.ts`): toda operação que
 * tentaria expor um valor falha fechado. Suporta só `vaultProvider: "noop"`.
 */
import { SecretResolutionFailedError } from "../errors";
import type {
  ResolvedCredential,
  ResolveSecretOptions,
  RuntimeVaultProvider,
  RuntimeVaultProviderHealth,
  SecretReferenceMetadata,
  VaultProvider,
} from "../types";

export class NoopRuntimeVaultProvider implements RuntimeVaultProvider {
  readonly id = "noop" as const;

  supports(vaultProvider: VaultProvider): boolean {
    return vaultProvider === "noop";
  }

  async resolveSecret(reference: SecretReferenceMetadata, _options: ResolveSecretOptions): Promise<ResolvedCredential> {
    void _options;
    throw new SecretResolutionFailedError(
      "vault_provider_unavailable",
      `NoopRuntimeVaultProvider nunca resolve valor de verdade (reference ${reference.id}) — configure um vault provider real antes de usar credenciais de verdade`,
    );
  }

  async validateReference(_reference: SecretReferenceMetadata): Promise<{ valid: boolean; errors: string[] }> {
    void _reference;
    return { valid: false, errors: ["noop_vault_provider: resolução de valor desligada"] };
  }

  async healthPreview(): Promise<RuntimeVaultProviderHealth> {
    return { id: this.id, available: false, message: "Noop — resolução de valor sempre desligada de propósito." };
  }
}
