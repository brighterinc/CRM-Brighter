---
type: reference
status: v1
last_updated: 2026-08-13
---

# Real Supabase Adapter — Credenciais

## Requisitos por operação

Todas as 8 operações declaram `requiredCredentialPurpose`/`requiredSecretType`
no catálogo (`supabase-real-operations.ts`) — vocabulário reusado, nunca
inventado, de `lib/provider-credentials-runtime/types.ts`
(`ProviderCredentialPurpose`) e `lib/control-plane-persistence/types.ts`
(`SecretReferenceType`):

| Operação | purpose | secretType |
|---|---|---|
| `project.validate` | `deploy` | `api_key` |
| `project.read` | `deploy` | `api_key` |
| `project.status` | `deploy` | `api_key` |
| `project.create` | `deploy` | `api_key` |
| `database.prepare` | `database_admin` | `database_password` |
| `auth.configure` | `deploy` | `api_key` |
| `storage.prepare` | `deploy` | `api_key` |
| `edge_functions.prepare` | `deploy` | `api_key` |

`database_admin`/`database_password` (não `deploy`/`api_key`) porque aplicar
o baseline versionado no Postgres do cliente é uma operação de banco, não de
gestão de projeto — mesmo raciocínio já usado pelo blueprint dry-run
(`../../capabilities.ts`, `supabase.database.prepare`).

## Como o adapter resolve

O adapter **nunca** lê `vault_key`/token diretamente. O fluxo:

1. `executeRealSupabaseOperation` busca a `PersistedProviderConnection` da
   instalação pro provider `"supabase"`
   (`ControlPlaneRepositories.providerConnections.findConnection`) — só pra
   extrair `secretReferenceId` (o resto da validação de status/conexão é
   responsabilidade da policy, ver abaixo).
2. Monta um `ProviderCredentialRequest` com esse `secretReferenceId` + o
   `purpose`/`operation` da operação — se não houver conexão, usa um id
   inexistente de propósito, deixando `withProviderCredential` negar
   fail-closed (`secret_reference_not_found`) sem duplicar essa checagem
   aqui.
3. Chama `withProviderCredential(deps, request, callback)` — esse boundary
   audita, avalia a policy (`evaluateProviderCredentialAccess`, default
   SEMPRE deny), cria/ativa/consome/libera a lease, e só então entrega um
   `ResolvedCredential` ao `callback`.
4. Dentro do `callback`, o valor é extraído **uma vez**
   (`credential.use(v => v)`) e reusado pras tentativas de retry — nunca
   retornado pelo `callback` (dispararia `CredentialEscapeAttemptError`).

## `loadAdapterRequirement` próprio

O catálogo de `withProviderCredential`'s policy (`purpose`/`secretType`
esperados) vem, por padrão, do catálogo do **blueprint dry-run**
(`resolveCredentialRequirementForAdapter`, que lê
`PROVISIONING_ADAPTER_CAPABILITY_CATALOG`). Esse catálogo não conhece
`project.validate`/`project.read`/`project.status` (só existem no catálogo
deste cluster) e usa `storage.configure` em vez de `storage.prepare`.

Por isso, quem monta `WithProviderCredentialDeps` pro Real Supabase Adapter
deve sobrescrever explicitamente:

```ts
import { createProviderCredentialsRuntimeDeps } from "@/lib/provider-credentials-runtime/factory";
import { resolveCredentialRequirementForSupabaseRealOperation } from "@/lib/provisioning-adapters/providers/supabase-real-operations";

const deps = createProviderCredentialsRuntimeDeps(controlPlaneRepos, {
  loadAdapterRequirement: resolveCredentialRequirementForSupabaseRealOperation,
});
```

Sem isso, a policy ainda funciona (só emite o warning
`no_adapter_credential_requirement_declared` pras 3 operações que o catálogo
antigo não conhece — não bloqueia), mas perde a checagem extra de
`purpose`/`secretType` contra o catálogo certo.

## Como cadastrar uma credencial real (fora do escopo desta etapa)

Esta etapa **não** cria UI de input de credencial nem cria referência real —
só consome o que já existe via `recordSecretReference` +
`recordProviderConnection` (`control-plane-persistence/services.ts`). Ver
`docs/control-plane-persistence/credentials-vault.md` e
`docs/provider-credentials-runtime/vault-providers.md` pro fluxo completo —
nenhum vault provider REAL (que resolve valor de verdade fora de teste)
existe ainda no repositório.
