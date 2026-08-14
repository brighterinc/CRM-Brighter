/**
 * Troca EXPLÍCITA entre repositories in-memory e persistidos — nunca
 * silenciosa. Nenhum código deste módulo decide sozinho qual backend usar;
 * quem chama (CLI, admin UI, teste, service futuro) passa `mode`
 * explicitamente. `"memory"` é o default de demonstração/teste (mesmo
 * catálogo vazio das *Foundation* In-Memory); `"database"` usa
 * `createAdminClient()` contra as 8 tabelas `control_plane_*`.
 *
 * `mode: "database"` é importado DINAMICAMENTE (`await import(...)`) — nunca
 * no topo do arquivo. Os `Database*Repository` importam (transitivamente)
 * `lib/supabase/admin.ts` → `lib/env.ts`, que VALIDA env vars do Supabase
 * NA HORA do import e lança se faltarem (CLI/teste sem `.env`, ex.
 * `pnpm control:persistence`, quebrava por isso antes desta função virar
 * async). Import dinâmico faz o branch `"memory"` nunca carregar esse grafo
 * de módulo — mesmo cuidado que os comentários de `lib/control-plane/repository.ts`
 * já registram pra `lib/tenants/current-installation.ts`.
 */
import { InMemoryInstallationRepository, type InstallationRepository } from "@/lib/control-plane/repository";
import { InMemoryTenantRepository, type TenantRepository } from "@/lib/tenants/repository";

import { InMemoryCredentialsVault } from "../vault/in-memory";
import { NoopCredentialsVault } from "../vault/noop";
import type { CredentialsVault, SecretReferenceReader, SecretUsageRecorder } from "../vault/types";
import type { DeploymentRepository } from "./deployment";
import {
  InMemoryDeploymentRepository,
  InMemoryOperationEventRepository,
  InMemoryProviderConnectionRepository,
  InMemoryProvisioningRepository,
} from "./in-memory";
import type { OperationEventRepository } from "./operation-event";
import type { ProviderConnectionRepository } from "./provider-connection";
import type { ProvisioningRunRepository } from "./provisioning";

export type ControlPlanePersistenceMode = "memory" | "database";

export type ControlPlaneRepositories = {
  mode: ControlPlanePersistenceMode;
  tenants: TenantRepository;
  installations: InstallationRepository;
  deployments: DeploymentRepository;
  provisioning: ProvisioningRunRepository;
  providerConnections: ProviderConnectionRepository;
  vault: CredentialsVault;
  /**
   * MESMA instância de `vault`, só que tipada pra leitura em massa
   * (`SecretReferenceReader`) — nunca uma segunda instância/estado. Existe
   * pra admin UI (`/app/settings/control-plane/persistence`) listar
   * referências via DI, sem importar `Database*Repository` estaticamente
   * (ver `vault/types.ts`).
   */
  secretReferences: SecretReferenceReader;
  /** MESMA instância de `vault`, tipada pra `recordUsage` (ver `vault/types.ts::SecretUsageRecorder`) — nunca uma segunda instância/estado. */
  secretUsage: SecretUsageRecorder;
  operationEvents: OperationEventRepository;
};

async function createDatabaseRepositories(): Promise<ControlPlaneRepositories> {
  const [{ DatabaseTenantRepository }, { DatabaseInstallationRepository }, { DatabaseDeploymentRepository }, { DatabaseProvisioningRepository }, { DatabaseProviderConnectionRepository }, { DatabaseSecretReferenceRepository }, { DatabaseOperationEventRepository }] =
    await Promise.all([
      import("./tenant"),
      import("./installation"),
      import("./deployment"),
      import("./provisioning"),
      import("./provider-connection"),
      import("../vault/database"),
      import("./operation-event"),
    ]);

  const secretReferenceRepository = new DatabaseSecretReferenceRepository();

  return {
    mode: "database",
    tenants: new DatabaseTenantRepository(),
    installations: new DatabaseInstallationRepository(),
    deployments: new DatabaseDeploymentRepository(),
    provisioning: new DatabaseProvisioningRepository(),
    providerConnections: new DatabaseProviderConnectionRepository(),
    vault: secretReferenceRepository,
    secretReferences: secretReferenceRepository,
    secretUsage: secretReferenceRepository,
    operationEvents: new DatabaseOperationEventRepository(),
  };
}

function createInMemoryRepositories(): ControlPlaneRepositories {
  const vault = new InMemoryCredentialsVault();

  return {
    mode: "memory",
    tenants: new InMemoryTenantRepository(),
    installations: new InMemoryInstallationRepository(),
    deployments: new InMemoryDeploymentRepository(),
    provisioning: new InMemoryProvisioningRepository(),
    providerConnections: new InMemoryProviderConnectionRepository(),
    vault,
    secretReferences: vault,
    secretUsage: vault,
    operationEvents: new InMemoryOperationEventRepository(),
  };
}

/**
 * `vault` em modo `"memory"` usa `InMemoryCredentialsVault` (nunca
 * `NoopCredentialsVault` — este último existe só como default explícito de
 * "vault desligado", pra código que ainda não decidiu qual usar; ver
 * `docs/control-plane-persistence/credentials-vault.md`).
 */
export async function createControlPlaneRepositories(mode: ControlPlanePersistenceMode): Promise<ControlPlaneRepositories> {
  return mode === "database" ? createDatabaseRepositories() : createInMemoryRepositories();
}

export { NoopCredentialsVault };
