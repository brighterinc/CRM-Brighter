---
type: architecture
status: v1 — 3 providers fake/noop, nenhum real
last_updated: 2026-08-13
---

# Vault Providers — Provider Credentials Runtime

## Contrato (`RuntimeVaultProvider`, `types.ts`)

```ts
interface RuntimeVaultProvider {
  readonly id: RuntimeVaultProviderId; // "noop" | "in_memory" | "environment"
  supports(vaultProvider: VaultProvider): boolean;
  resolveSecret(reference: SecretReferenceMetadata, options: { singleUse: boolean }): Promise<ResolvedCredential>;
  validateReference(reference: SecretReferenceMetadata): Promise<{ valid: boolean; errors: string[] }>;
  healthPreview(): Promise<{ id, available, message }>;
}
```

Separado do `CredentialsVault` de persistência (`lib/control-plane-persistence/vault/`)
de propósito — mesma doutrina de `SecretReferenceReader` ficar fora de
`CredentialsVault`: um resolve METADATA (persistida, Supabase), o outro
resolve VALOR (nunca persistido, só em memória).

## `VaultProvider` (persistência) × `RuntimeVaultProviderId` (esta camada)

São vocabulários DIFERENTES e deliberadamente não 1:1:

- `VaultProvider` (`lib/control-plane-persistence/types.ts`) — fechado,
  CHECK-backed no banco: `noop` | `in_memory` | `database_placeholder`.
  Descreve onde a `SecretReferenceMetadata` diz que o backend vive.
- `RuntimeVaultProviderId` (esta camada) — TS-only, aberto a crescer sem
  migration: `noop` | `in_memory` | `environment`.

O `RuntimeVaultProviderRegistry` faz a ponte via `.supports(vaultProvider)`.

## Os 3 providers

### `NoopRuntimeVaultProvider`

Suporta `vaultProvider: "noop"`. Toda operação de resolução lança
`SecretResolutionFailedError("vault_provider_unavailable", …)` — fail-closed
por desenho, mesma doutrina de `NoopCredentialsVault`.

### `InMemoryRuntimeVaultProvider`

Suporta `vaultProvider: "in_memory"`. `Map<secretReferenceId, string>`
privado por instância (nunca singleton, nunca persiste). Quem chama semeia
via `.seed(secretReferenceId, value)` ANTES de resolver — usado em
teste/CLI/simulação. `.unseed()`/`.clear()` limpam.

### `EnvironmentRuntimeVaultProvider`

Suporta `vaultProvider: "database_placeholder"` — essa é a única entrada do
vocabulário fechado que já significa "referência real, backend ainda não
implementado" (é o que `DatabaseSecretReferenceRepository` usa hoje). Nasce
**desabilitado** (`enabled: false`); mesmo habilitado, só resolve env var
cujo nome comece com um prefixo permitido (default `BRIGHTER_RUNTIME_`).
`vaultKey` de uma referência resolvida por este provider é interpretado
como o NOME da env var, nunca o valor. Ver `security.md` pro raciocínio de
segurança completo.

`"environment"` não é somado ao vocabulário fechado `VAULT_PROVIDERS`
porque isso exigiria alterar o CHECK constraint da coluna via migration —
proibido nesta etapa.

## Registry (`registry.ts`)

`RuntimeVaultProviderRegistry` — um provider por `id`, nunca dois
registrados pro mesmo `id` (`RuntimeVaultProviderAlreadyRegisteredError`),
sem singleton global mutável. `resolveProviderForVault(vaultProvider)` acha
o provider registrado que suporta aquele `vaultProvider` — lança
`RuntimeVaultProviderNotFoundError` se nenhum suporta (fail-closed, nunca
devolve `undefined` pra seguir em frente sem vault).

`createDefaultRuntimeVaultProviderRegistry()` (`providers/index.ts`) monta
os 3 na ordem canônica — `EnvironmentRuntimeVaultProvider` nasce
desabilitado; quem quer habilitá-lo monta o próprio registry.

## Backend real — pendente

Nenhum destes 3 providers resolve um segredo de verdade a partir de um
backend criptografado. O candidato (`pgp_sym_encrypt`/`pgp_sym_decrypt`,
mesmo padrão do OAuth Nuvemshop) está documentado como pendência em
`docs/control-plane-persistence/runtime-boundary.md` e segue pendente após
esta fase — ver `runtime-boundary.md` (deste diretório) pro que muda quando
ele existir.
