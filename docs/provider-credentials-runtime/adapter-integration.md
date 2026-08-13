---
type: architecture
status: v1 — declaração no catálogo, nenhum adapter real executado
last_updated: 2026-08-13
---

# Integração com Provisioning Adapters

## Campos novos em `ProvisioningAdapterCapability`

`lib/provisioning-adapters/types.ts` ganhou dois campos opcionais:

```ts
export type ProvisioningAdapterCapability = {
  // ...campos existentes (id, provider, operation, supportedPlans, etc.)
  requiredCredentialPurpose?: string; // nome de um ProviderCredentialPurpose
  requiredSecretType?: string;        // nome de um SecretReferenceType
};
```

Aditivo — não muda o contrato existente (mesmo padrão de como
`requiredModules?`/`requiredInfra?` foram adicionados antes).

## Por que `string` solto, não o tipo estrito

`lib/provisioning-adapters` **nunca** importa
`lib/provider-credentials-runtime` — a dependência é sempre no sentido
inverso (`provider-credentials-runtime` conhece `provisioning-adapters`,
não o contrário). Se `ProvisioningAdapterCapability` importasse
`ProviderCredentialPurpose` diretamente, e o novo módulo por sua vez
importasse `ProvisioningProvider` de `provisioning-adapters/types.ts` (como
já faz), seria um import circular entre os dois módulos. Por isso os dois
campos ficam como `string` solto no catálogo, e a interpretação/validação
tipada acontece só do lado de `provider-credentials-runtime`.

## `resolveCredentialRequirementForAdapter()`

`lib/provider-credentials-runtime/adapter-integration.ts`:

```ts
function resolveCredentialRequirementForAdapter(
  provider: ProvisioningProvider,
  operation: string,
): ProviderCredentialAdapterRequirement | null
```

Busca a capability no catálogo estático
(`PROVISIONING_ADAPTER_CAPABILITY_CATALOG`, sem I/O) e converte os campos
soltos num `{ purpose, secretType }` tipado. Se a capability não declarou
`requiredCredentialPurpose`, OU declarou um valor **fora** do vocabulário
conhecido (`PROVIDER_CREDENTIAL_PURPOSES`/`SECRET_REFERENCE_TYPES`),
devolve `null` — erro de configuração no catálogo nunca vira um requisito
adulterado passando por válido.

## Onde isso entra na policy

`factory.ts::createProviderCredentialsRuntimeDeps` usa
`resolveCredentialRequirementForAdapter` como **default** de
`loadAdapterRequirement` — toda chamada de `withProviderCredential` já
cruza automaticamente o `purpose`/`secretType` declarados no catálogo
contra o que o request pede, sem precisar de nenhuma configuração extra.
Ver `policies.md` pros blockers `purpose_not_authorized`/`secret_type_mismatch`.

## Capabilities já anotadas nesta etapa

Prova o mecanismo, sem tentar anotar as 34 capabilities do catálogo:

| Capability | `requiredCredentialPurpose` | `requiredSecretType` |
|---|---|---|
| `fake.simulate` | `api_call` | `api_key` |
| `supabase.project.create` | `deploy` | `api_key` |
| `supabase.database.prepare` | `database_admin` | `database_password` |
| `vercel.project.create` | `deploy` | `api_key` |
| `dns.record.plan` | `dns_write` | `api_key` |
| `waha.session.plan` | `messaging` | `api_key` |

`fake.simulate` é o "adapter fake" pedido pra provar o fluxo fim a fim
(sem executar nada real) — usado pelos cenários de simulação
`healthy`/`adapter-requirement` (`simulation.md`) e por
`tests/unit/provider-credentials-runtime-runtime.test.ts`.

## Nenhum adapter real é executado

`ProvisioningProviderAdapter.executeReal()` continua sempre lançando
`RealProvisioningDisabledError` — nada nesta fase muda isso. A integração
aqui é só "declarar o requisito de credencial" e "a policy checar esse
requisito antes de resolver o valor" — o hook de injetar de fato a
credencial resolvida num `ProvisioningAdapterRequest` real fica pra quando
um adapter real existir (ver ROADMAP: "Real Supabase Adapter" e seguintes).
