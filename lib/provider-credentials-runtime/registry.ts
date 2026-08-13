/**
 * Registry central de `RuntimeVaultProvider` — mesma doutrina de
 * `ProvisioningAdapterRegistry`: um provider por `id`, nunca dois registrados
 * pro mesmo `id` (rejeitado), sem singleton global mutável. Cada chamador
 * (CLI, admin UI, teste, `factory.ts`) monta a própria instância via
 * `createDefaultRuntimeVaultProviderRegistry()` (`providers/index.ts`).
 *
 * Responsabilidade extra em relação ao registry de adapters:
 * `resolveProviderForVault(vaultProvider)` — dado o `vaultProvider` fechado
 * de uma `SecretReferenceMetadata` (`noop`/`in_memory`/`database_placeholder`),
 * acha QUAL `RuntimeVaultProvider` registrado sabe resolvê-lo
 * (`.supports()`). Nunca "primeiro que bater" silencioso — se dois
 * providers registrados suportam o mesmo `vaultProvider`, isso é bug de
 * configuração e lança na hora do registro, não da resolução.
 */
import { RuntimeVaultProviderAlreadyRegisteredError, RuntimeVaultProviderNotFoundError } from "./errors";
import { RUNTIME_VAULT_PROVIDER_IDS, type RuntimeVaultProvider, type RuntimeVaultProviderId, type VaultProvider } from "./types";

export class RuntimeVaultProviderRegistry {
  private readonly providers = new Map<RuntimeVaultProviderId, RuntimeVaultProvider>();

  registerProvider(provider: RuntimeVaultProvider): void {
    if (this.providers.has(provider.id)) {
      throw new RuntimeVaultProviderAlreadyRegisteredError(provider.id);
    }
    this.providers.set(provider.id, provider);
  }

  unregisterProvider(id: RuntimeVaultProviderId): void {
    this.providers.delete(id);
  }

  findProvider(id: RuntimeVaultProviderId): RuntimeVaultProvider | undefined {
    return this.providers.get(id);
  }

  /** Ordem sempre canônica (`RUNTIME_VAULT_PROVIDER_IDS`) — nunca ordem de registro. */
  listProviders(): RuntimeVaultProvider[] {
    return RUNTIME_VAULT_PROVIDER_IDS.map((id) => this.providers.get(id)).filter((p): p is RuntimeVaultProvider => Boolean(p));
  }

  /**
   * Acha o provider registrado que suporta o `vaultProvider` dado. Lança
   * `RuntimeVaultProviderNotFoundError` se nenhum registrado suporta —
   * fail-closed: nunca devolve `undefined` pra quem chama seguir em frente
   * silenciosamente sem vault.
   */
  resolveProviderForVault(vaultProvider: VaultProvider): RuntimeVaultProvider {
    const found = this.listProviders().find((p) => p.supports(vaultProvider));
    if (!found) throw new RuntimeVaultProviderNotFoundError(vaultProvider);
    return found;
  }

  async healthPreview(): Promise<Awaited<ReturnType<RuntimeVaultProvider["healthPreview"]>>[]> {
    return Promise.all(this.listProviders().map((p) => p.healthPreview()));
  }
}
