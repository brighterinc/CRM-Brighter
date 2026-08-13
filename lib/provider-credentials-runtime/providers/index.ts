/**
 * Barrel + fábrica dos vault providers padrão desta fase — nunca singleton
 * global (mesma doutrina de `providers/index.ts` da Provisioning Adapters
 * Foundation). `EnvironmentRuntimeVaultProvider` nasce desabilitado por
 * padrão nesta fábrica — quem quiser habilitá-lo (teste/CLI) monta o próprio
 * registry com `registerRuntimeVaultProvider(new EnvironmentRuntimeVaultProvider({ enabled: true }))`.
 */
import { RuntimeVaultProviderRegistry } from "../registry";
import { EnvironmentRuntimeVaultProvider } from "./environment";
import { InMemoryRuntimeVaultProvider } from "./in-memory";
import { NoopRuntimeVaultProvider } from "./noop";

export { EnvironmentRuntimeVaultProvider, InMemoryRuntimeVaultProvider, NoopRuntimeVaultProvider };

export function createDefaultRuntimeVaultProviderRegistry(): RuntimeVaultProviderRegistry {
  const registry = new RuntimeVaultProviderRegistry();
  registry.registerProvider(new NoopRuntimeVaultProvider());
  registry.registerProvider(new InMemoryRuntimeVaultProvider());
  registry.registerProvider(new EnvironmentRuntimeVaultProvider());
  return registry;
}
