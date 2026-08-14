---
type: architecture
status: v1 — não aplicado
last_updated: 2026-08-14
---

# Runtime Integration — como isto se pluga em `withProviderCredential`

## Nenhum segundo caminho pra credencial

`PostgresPgcryptoRuntimeVaultProvider` implementa `RuntimeVaultProvider`
(`lib/provider-credentials-runtime/types.ts`) — a MESMA interface de
`NoopRuntimeVaultProvider`/`InMemoryRuntimeVaultProvider`/
`EnvironmentRuntimeVaultProvider`. `withProviderCredential()`
(`runtime.ts`, INALTERADO por esta fase) não sabe nem precisa saber que
existe um vault provider novo — ele pergunta ao
`RuntimeVaultProviderRegistry` "quem suporta `vaultProvider:
'postgres_pgcrypto'`?" e usa o que vier.

```
Provisioning Adapter
  → requiredCredentialPurpose / requiredSecretType   (inalterado)
  → withProviderCredential()                          (inalterado)
  → policy (evaluateProviderCredentialAccess)          (inalterado)
  → lease (CredentialLease)                            (inalterado)
  → resolver.ts → registry.resolveProviderForVault("postgres_pgcrypto")
  → PostgresPgcryptoRuntimeVaultProvider.resolveSecret  (NOVO)
      → SecretPayloadRepository.getActiveCiphertext     (NOVO)
      → SecretEncryptionProvider.decrypt                (NOVO)
  → ResolvedCredential                                  (inalterado — buffer privado, .use() único jeito de ler)
  → audit                                                (inalterado — credential_resolved etc.)
```

## O que o novo provider adiciona ao contrato

`resolveSecret` tem UMA checagem extra que os providers anteriores não
precisavam: consistência de VERSÃO entre metadata (`reference.version`) e
payload (`activeVersion.version`). Nenhum dos providers antigos versiona
(`InMemoryRuntimeVaultProvider` guarda um valor só, sem versão;
`EnvironmentRuntimeVaultProvider` lê `process.env`, sem versão) — esta é a
primeira vez que o boundary precisa lidar com "a metadata e o payload
podem divergir", e a resposta é `SecretVersionStaleError`, fail-closed.

## `recordUsage` — o único hook novo no contrato de fato

`PostgresPgcryptoRuntimeVaultProviderOptions.recordUsage` é opcional e
fire-and-forget — chamado DEPOIS de `resolveSecret` já ter construído o
`ResolvedCredential` (nunca bloqueia a entrega da credencial ao callback).
Nenhum provider anterior tinha isso porque nenhum tinha `last_used_at` pra
atualizar. `createRealVaultBackendRuntimeVaultProvider` (`vault/factory.ts`)
já pluga `recordSecretUsage(repos, id)` por padrão.

## Registro — explícito, nunca no default

```typescript
import { registerPostgresPgcryptoVaultProvider } from "@/lib/provider-credentials-runtime/providers";
import { createRealVaultBackendRuntimeVaultProvider } from "@/lib/control-plane-persistence/vault/factory";

// nunca no boot padrão da app — só onde alguém DECIDE ligar o backend real
const registry = createDefaultRuntimeVaultProviderRegistry(); // noop/in_memory/environment
registerPostgresPgcryptoVaultProvider(registry, {
  payloadRepository: new DatabaseSecretPayloadRepository(),
  encryptionProvider: new PgcryptoSecretEncryptionProvider(),
});
```

ou, de forma mais direta, a partir de um `ControlPlaneRepositories` já
montado:

```typescript
const provider = createRealVaultBackendRuntimeVaultProvider(repos);
registry.registerProvider(provider);
```

## O que muda pra um Provisioning Adapter existente

Nada, no código do adapter. `withProviderCredential` já é a única forma de
um adapter pedir credencial — trocar `vault_provider` de uma
`SecretReferenceMetadata` de `"database_placeholder"`/`"in_memory"` pra
`"postgres_pgcrypto"` é uma mudança de DADO (a linha em
`control_plane_secret_references`), não de código do adapter. Ver
`supabase-integration.md` pro caso concreto do Real Supabase Adapter.
