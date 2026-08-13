---
type: architecture
status: v1
last_updated: 2026-08-13
---

# Policy engine — Provider Credentials Runtime

`lib/provider-credentials-runtime/policy.ts::evaluateProviderCredentialAccess()`
— função PURA (sem I/O). Quem chama (`runtime.ts`) já resolveu
`secretReference`/`providerConnection`/`installation` via os repositories
reais/in-memory ANTES de chamar aqui — este módulo só decide, nunca busca.

## Default = SEMPRE deny

```ts
const allowed = blockers.length === 0
  && Boolean(secretReference)
  && Boolean(providerConnection)
  && Boolean(installation);
```

`allowed` só vira `true` se as três dependências foram encontradas E nenhum
blocker disparou. Ausência de dado nunca vira aprovação por omissão —
diferente de um `if (blockers.length === 0) allow` ingênuo, que aprovaria
silenciosamente um request cuja secret reference nem existe (nenhum blocker
específico dispararia se o código simplesmente pulasse a checagem por dado
ausente).

## Checklist completo de blockers

| Blocker | Condição |
|---|---|
| `secret_reference_not_found` | `secretReference` é `null`. |
| `secret_reference_not_active:<status>` | Status ≠ `active` (cobre `revoked`/`rotated`/`pending`). |
| `provider_mismatch` | `secretReference.provider` ≠ `request.provider` (secrets `platform`-wide sem tenant/installation são exceção — ver abaixo). |
| `cross_tenant_denied` | `secretReference.tenantId` não-nulo e ≠ `request.tenantId`. |
| `cross_installation_denied` | `secretReference.installationId` não-nulo e ≠ `request.installationId`. |
| `provider_connection_not_found` | `providerConnection` é `null`. |
| `provider_connection_provider_mismatch` | `providerConnection.provider` ≠ `request.provider`. |
| `provider_connection_installation_mismatch` | `providerConnection.installationId` ≠ `request.installationId`. |
| `provider_connection_unavailable:<status>` | `providerConnection.status` ≠ `available`. |
| `installation_not_found` | `installation` é `null`. |
| `installation_tenant_mismatch` | `installation.tenantId` ≠ `request.tenantId`. |
| `installation_blocked:<status>` | Status ∈ `{archived, error}`. |
| `purpose_not_authorized` | `adapterRequirement.purpose` ≠ `request.purpose` (só quando um requisito foi declarado — ver `adapter-integration.md`). |
| `secret_type_mismatch` | `adapterRequirement.secretType` ≠ `secretReference.type`. |

Warning (não bloqueia, mas fica no resultado): `no_adapter_credential_requirement_declared`
— nenhum Provisioning Adapter declarou requisito de credencial pra esta
`provider`/`operation`. Não é blocker porque nem toda operação passa por um
adapter (ex.: operações administrativas diretas).

## Cross-tenant — o teste mais importante

Uma `ProviderConnection` "válida" na tabela (installation certa, provider
certo, status `available`) **não basta** — se ela aponta pra uma
`secretReferenceId` que pertence a outro tenant/installation, a policy
recusa mesmo assim. Provado em
`tests/unit/provider-credentials-runtime-policy.test.ts` e no cenário de
simulação `cross-tenant-denied` (constrói exatamente esse cenário de
"conexão mal configurada apontando pra secret errada").

## Secrets `platform`-wide

Uma `SecretReferenceMetadata` com `provider: "platform"`,
`tenantId: null` e `installationId: null` (ex.: SMTP compartilhado da
Brighter) pula as checagens de `provider_mismatch`/`cross_tenant_denied`/
`cross_installation_denied` — ela não pertence a nenhum tenant específico
por desenho, então não há "tenant errado" possível. Ainda assim precisa
estar `active` e ter uma `providerConnection`/`installation` válidas.

## `PolicyDecision` — nunca carrega segredo

```ts
type ProviderCredentialPolicyDecision = {
  allowed: boolean;
  blockers: string[];
  warnings: string[];
  reason: string;
  auditMetadata: Record<string, unknown>; // provider, purpose, operation, contadores — nunca vaultKey/valor
};
```

`auditMetadata` é o que vai pro evento `credential_access_denied` — ver
`security.md`.
