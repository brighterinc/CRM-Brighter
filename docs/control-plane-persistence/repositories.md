---
type: architecture
status: v1
last_updated: 2026-08-12
---

# Repositories — Control Plane Persistence

## In-Memory vs Database, sempre lado a lado

Nenhum `Database*Repository` substitui um `InMemory*Repository` existente —
os dois convivem, implementando a MESMA interface quando ela já existia
(`TenantRepository`, `InstallationRepository`), ou uma interface nova
definida nesta fase (as 4 entidades sem repository anterior).

| Interface | In-Memory (já existia) | Database (novo) |
|---|---|---|
| `TenantRepository` (`lib/tenants/repository.ts`) | `InMemoryTenantRepository` | `DatabaseTenantRepository` |
| `InstallationRepository` (`lib/control-plane/repository.ts`) | `InMemoryInstallationRepository` | `DatabaseInstallationRepository` |
| `DeploymentRepository` (novo) | `InMemoryDeploymentRepository` | `DatabaseDeploymentRepository` |
| `ProvisioningRunRepository` (novo) | `InMemoryProvisioningRepository` | `DatabaseProvisioningRepository` |
| `ProviderConnectionRepository` (novo) | `InMemoryProviderConnectionRepository` | `DatabaseProviderConnectionRepository` |
| `CredentialsVault` (novo) | `InMemoryCredentialsVault` | `DatabaseSecretReferenceRepository` |
| `OperationEventRepository` (novo) | `InMemoryOperationEventRepository` | `DatabaseOperationEventRepository` |

## Troca explícita via factory — nunca silenciosa

```typescript
const repos = await createControlPlaneRepositories("memory" | "database");
```

`createControlPlaneRepositories` (`repositories/factory.ts`) é **async** e
importa o branch `"database"` **dinamicamente** (`await import(...)`) — os
`Database*Repository` importam (transitivamente) `lib/supabase/admin.ts` →
`lib/env.ts`, que VALIDA env vars do Supabase NA HORA do import e lança se
faltarem. Um `import` estático no topo do arquivo quebrava `pnpm
control:persistence` (CLI 100% in-memory, roda sem `.env`) mesmo sem NENHUM
caminho de código realmente precisar de Supabase. Import dinâmico faz o
branch `"memory"` nunca carregar esse grafo de módulo.

## Sem `organization_id` — quem garante o filtro

Diferente de `lib/lgpd/repository.ts` (que filtra `organization_id`
manualmente porque a tabela É tenant-aware), `control_plane_*` não tem
`organization_id` nenhum — não há o que filtrar por linha. A garantia de
acesso é 100% RLS (`fn_is_platform_admin()`, ver `rls.md`) + a
responsabilidade de quem CHAMA o repository (`requirePlatformAdmin()` na UI)
de já ter confirmado platform-admin antes.

## `DatabaseInstallationRepository` — o caso especial

`Installation.deployment`/`.branding`/`.modules`/`.deploymentPlan`/
`.provisioning` nunca são coluna (ver `schema.md`) — são sempre derivados do
`tenant` via `deriveInstallationFromTenant`. Mas `control_plane_tenants`
também nunca guarda `.manifest` (ver `schema.md` — mesmo motivo). Isso cria
uma dependência: pra hidratar uma `Installation` lida do banco, o
repository precisa de um `tenant` COM manifesto, mas o tenant lido do banco
nunca tem.

Resolvido por `ensureTenantManifest()` (`repositories/installation.ts`):
regenera o manifesto na hora com a MESMA função determinística que o criou
originalmente (`generateDeploymentManifest`, `lib/deployment/`) — nunca lido
de um snapshot que poderia estar desatualizado. `generateDeploymentManifest`
é uma função pura (sem I/O) dos campos do próprio tenant (`clientName`,
`clientSlug`, `domain`, `plan`, `requestedModules`, `branding`), então
regenerar é sempre seguro e sempre consistente com o que
`control_plane_deployments` guardou como snapshot histórico daquele momento.

## Mappers — nunca snake_case no domínio

`mappers/tenant.ts`, `mappers/installation.ts`, `mappers/persistence.ts`
(as 6 entidades restantes). Convenção única: toda leitura passa por
`*RowToDomain`/`*RowToMetadata`, toda escrita por `*DomainToInsertRow`/
`*DomainToUpsertRow`. Nenhum código fora de `mappers/` lê/escreve uma coluna
`snake_case` diretamente.

## Testando sem banco

`repositories/in-memory.ts` + `vault/in-memory.ts` cobrem as 8 entidades
100% em memória — é o que `pnpm control:persistence` e os testes unitários
usam. Nenhum teste desta fase precisa de Postgres real (isolamento RLS de
verdade é `test:db`, documentado mas não executado aqui — ver `rls.md`).
