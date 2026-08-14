/**
 * Barrel + fábrica dos vault providers padrão desta fase — nunca singleton
 * global (mesma doutrina de `providers/index.ts` da Provisioning Adapters
 * Foundation). `EnvironmentRuntimeVaultProvider` nasce desabilitado por
 * padrão nesta fábrica — quem quiser habilitá-lo (teste/CLI) monta o próprio
 * registry com `registerRuntimeVaultProvider(new EnvironmentRuntimeVaultProvider({ enabled: true }))`.
 *
 * `PostgresPgcryptoRuntimeVaultProvider` (Real Vault Backend) NUNCA entra em
 * `createDefaultRuntimeVaultProviderRegistry()` — mesmo precedente do Real
 * Supabase Adapter não estar em `createDefaultProvisioningAdapterRegistry()`:
 * o registry default continua seguro de importar sem tocar banco/rede/chave
 * mestra. Quem quer o backend real chama
 * `registerPostgresPgcryptoVaultProvider(registry, deps)` explicitamente.
 */
import { RuntimeVaultProviderRegistry } from "../registry";
import { EnvironmentRuntimeVaultProvider } from "./environment";
import { InMemoryRuntimeVaultProvider } from "./in-memory";
import { NoopRuntimeVaultProvider } from "./noop";
import {
  createPostgresPgcryptoRuntimeVaultProvider,
  PostgresPgcryptoRuntimeVaultProvider,
  type PostgresPgcryptoRuntimeVaultProviderOptions,
} from "./postgres-pgcrypto";

export {
  EnvironmentRuntimeVaultProvider,
  InMemoryRuntimeVaultProvider,
  NoopRuntimeVaultProvider,
  PostgresPgcryptoRuntimeVaultProvider,
  createPostgresPgcryptoRuntimeVaultProvider,
};
export type { PostgresPgcryptoRuntimeVaultProviderOptions };

export function createDefaultRuntimeVaultProviderRegistry(): RuntimeVaultProviderRegistry {
  const registry = new RuntimeVaultProviderRegistry();
  registry.registerProvider(new NoopRuntimeVaultProvider());
  registry.registerProvider(new InMemoryRuntimeVaultProvider());
  registry.registerProvider(new EnvironmentRuntimeVaultProvider());
  return registry;
}

/** Registra o Real Vault Backend num registry já existente — nunca chamado por `createDefaultRuntimeVaultProviderRegistry()`. */
export function registerPostgresPgcryptoVaultProvider(
  registry: RuntimeVaultProviderRegistry,
  deps: PostgresPgcryptoRuntimeVaultProviderOptions,
): void {
  registry.registerProvider(createPostgresPgcryptoRuntimeVaultProvider(deps));
}
