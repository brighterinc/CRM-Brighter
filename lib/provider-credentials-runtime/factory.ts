/**
 * Fábrica de `WithProviderCredentialDeps` — troca EXPLÍCITA de peças, nunca
 * singleton global, mesmo espírito de `createControlPlaneRepositories`
 * (`lib/control-plane-persistence/repositories/factory.ts`). Constrói o
 * conjunto completo de dependências de `withProviderCredential()` a partir
 * de um `ControlPlaneRepositories` já montado (memory ou database) — nunca
 * duplica `providerConnections`/`installations`/`vault`, só adapta.
 *
 * `auditSink` default grava em `control_plane_operation_events` de verdade
 * (via `createControlPlaneOperationEventAuditSink`), que por sua vez usa
 * `emitAudit` de `services.ts` — que por padrão importa `@/lib/audit`
 * (e, transitivamente, `lib/env.ts`) SOB DEMANDA. Quem chama num contexto
 * 100% in-memory sem `.env` (CLI, teste, simulação) DEVE passar
 * `actorContext: { emitAudit: async () => {} }` (mesmo padrão `NOOP_CTX` de
 * `scripts/control-plane-persistence-summary.ts`) — ver
 * `createInMemoryProviderCredentialsRuntimeDeps` abaixo, que já faz isso.
 */
import type { ControlPlaneActorContext } from "@/lib/control-plane-persistence/services";
import { createControlPlaneRepositories, type ControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";

import { resolveCredentialRequirementForAdapter } from "./adapter-integration";
import { createControlPlaneOperationEventAuditSink, type ProviderCredentialAuditSink } from "./audit";
import { createDefaultRuntimeVaultProviderRegistry } from "./providers";
import type { ProviderCredentialAdapterRequirement } from "./policy";
import { InMemoryCredentialLeaseRepository, type CredentialLeaseRepository } from "./repository";
import type { RuntimeVaultProviderRegistry } from "./registry";
import type { WithProviderCredentialDeps } from "./runtime";
import type { ProvisioningProvider } from "./types";

export type ProviderCredentialsRuntimeDepsOptions = {
  vaultProviderRegistry?: RuntimeVaultProviderRegistry;
  leaseRepository?: CredentialLeaseRepository;
  auditSink?: ProviderCredentialAuditSink;
  actorContext?: ControlPlaneActorContext;
  loadAdapterRequirement?: (provider: ProvisioningProvider, operation: string) => ProviderCredentialAdapterRequirement | null;
};

export function createProviderCredentialsRuntimeDeps(
  controlPlaneRepos: ControlPlaneRepositories,
  options: ProviderCredentialsRuntimeDepsOptions = {},
): WithProviderCredentialDeps {
  return {
    vault: controlPlaneRepos.vault,
    vaultProviderRegistry: options.vaultProviderRegistry ?? createDefaultRuntimeVaultProviderRegistry(),
    leaseRepository: options.leaseRepository ?? new InMemoryCredentialLeaseRepository(),
    auditSink: options.auditSink ?? createControlPlaneOperationEventAuditSink(controlPlaneRepos, options.actorContext ?? {}),
    // Default: lê o catálogo estático de `lib/provisioning-adapters` — sem
    // I/O, sempre disponível. Quem quiser desligar/sobrescrever passa
    // `loadAdapterRequirement: () => null` (ou uma função própria) explicitamente.
    loadAdapterRequirement: options.loadAdapterRequirement ?? resolveCredentialRequirementForAdapter,
    loadProviderConnection: async (installationId, provider) => {
      const connection = await controlPlaneRepos.providerConnections.findConnection(installationId, provider);
      if (!connection) return null;
      return { id: connection.id, installationId: connection.installationId, provider: connection.provider, status: connection.status };
    },
    loadInstallation: async (installationId) => {
      const installation = await controlPlaneRepos.installations.findInstallation(installationId);
      if (!installation) return null;
      return { id: installation.id, tenantId: installation.tenant.id, status: installation.status };
    },
  };
}

/**
 * Conveniência 100% in-memory — monta `ControlPlaneRepositories` em modo
 * `"memory"` E um `emitAudit` no-op, pra CLI/teste/simulação nunca tocar
 * `@/lib/audit`/`lib/env.ts`/Supabase real. Nunca chamado em produção —
 * `app/`/rotas reais usam `createProviderCredentialsRuntimeDeps` direto com
 * um `ControlPlaneRepositories` em modo `"database"`.
 */
export async function createInMemoryProviderCredentialsRuntimeDeps(
  options: ProviderCredentialsRuntimeDepsOptions = {},
): Promise<{ deps: WithProviderCredentialDeps; controlPlaneRepos: ControlPlaneRepositories }> {
  const controlPlaneRepos = await createControlPlaneRepositories("memory");
  const deps = createProviderCredentialsRuntimeDeps(controlPlaneRepos, {
    ...options,
    actorContext: options.actorContext ?? { emitAudit: async () => {} },
  });
  return { deps, controlPlaneRepos };
}
