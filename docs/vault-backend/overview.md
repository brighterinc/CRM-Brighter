---
type: architecture
status: v1 — não aplicado
last_updated: 2026-08-14
---

# Real Vault Backend — Overview

> `lib/control-plane-persistence/vault/` (persistência) +
> `lib/provider-credentials-runtime/providers/postgres-pgcrypto.ts` (resolução
> runtime). Primeiro backend REAL do Credentials Vault
> (`vault_provider: "postgres_pgcrypto"`). Migration `0099_real_vault_backend`
> — **criada, revisada, NÃO aplicada** a nenhum banco real.

## Onde isto se encaixa

```
Provider
   ↓
Provisioning Adapter               (lib/provisioning-adapters/)
   ↓
Provider Credentials Runtime       (lib/provider-credentials-runtime/ — withProviderCredential)
   ↓
Credentials Vault                  (lib/control-plane-persistence/vault/ — CredentialsVault, metadata)
   ↓
Encrypted Secret Storage           (ESTA FASE — control_plane_secret_ciphertexts + pgcrypto)
```

Nenhuma peça acima desta foi reescrita. `CredentialsVault`
(`createReference`/`resolveReferenceMetadata`/`rotateReference`/
`revokeReference`/`validateReference`) continua exatamente como era —
metadata-only, sem `getSecretValue()`. `withProviderCredential()` continua o
único ponto de entrada de leitura. Este backend só PREENCHE o
`RuntimeVaultProvider` que faltava: até aqui, `vault_provider:
"database_placeholder"` era um literal reservado sem implementação real
nenhuma por trás.

## Separação de conceitos (as 5 áreas pedidas)

| Área | Onde vive | Nunca... |
|---|---|---|
| 1. Secret Reference Metadata | `control_plane_secret_references` (migration 0098, inalterada exceto +`last_used_at`) | ...guarda ciphertext ou plaintext |
| 2. Encrypted Secret Payload | `control_plane_secret_ciphertexts` (NOVA, migration 0099) | ...é lida fora de `PostgresPgcryptoRuntimeVaultProvider`/`secret-value-service.ts` |
| 3. Encryption Key / Master Key | `private.app_secrets` (linha `brighter_vault_key`) + GUC `app.brighter_vault_key`, lida só por `private.fn_vault_key()` | ...é commitada, logada, ou sai do schema `private` |
| 4. Runtime Resolution | `PostgresPgcryptoRuntimeVaultProvider` (`lib/provider-credentials-runtime/providers/postgres-pgcrypto.ts`) | ...é chamada fora de `withProviderCredential()` |
| 5. Audit trail | `control_plane_operation_events` (reusado, novos `eventType`s `secret_value.*`) + `api_audit_log` (novas `AuditAction`s `control_plane.secret_value_*`) | ...carrega `value`/`ciphertext`/`plaintext` em metadata |

Nenhuma tabela genérica mistura estas 5 áreas — é a regra que a tarefa pediu
explicitamente, e o desenho abaixo é a prova de que ela foi seguida.

## Por que uma tabela NOVA pro ciphertext, nunca coluna em `control_plane_secret_references`

`control_plane_secret_references` é METADATA PÚBLICA por desenho — qualquer
platform-admin lê via RLS `fn_is_platform_admin()` (mesma policy desde a
migration 0098). Se o ciphertext vivesse na mesma linha, seria impossível dar
essa visibilidade de metadata sem TAMBÉM expor a coluna de ciphertext pra
qualquer platform-admin autenticado — RLS não filtra COLUNA, só LINHA. A
tabela nova (`control_plane_secret_ciphertexts`) resolve isso: RLS ligada, **ZERO
policies**, nem platform-admin (ver `threat-model.md` §"platform-admin ≠
acesso ao valor").

## Peças novas (TypeScript)

| Arquivo | Papel |
|---|---|
| `vault/encryption.ts` | `SecretEncryptionProvider` — contrato, separado de `RuntimeVaultProvider` |
| `vault/encryption-fake.ts` | `FakeSecretEncryptionProvider` — XOR reversível, só teste/simulação |
| `vault/encryption-pgcrypto.ts` | `PgcryptoSecretEncryptionProvider` — real, chama `fn_vault_encrypt_secret`/`fn_vault_decrypt_secret` via RPC injetável |
| `vault/secret-payload.ts` | `SecretPayloadRepository` — contrato + `InMemorySecretPayloadRepository` |
| `vault/secret-payload-database.ts` | `DatabaseSecretPayloadRepository` — real, RPC `fn_vault_write_secret_version`/`fn_vault_revoke_secret` |
| `vault/secret-value-service.ts` | Orquestração `storeSecretValue`/`rotateSecretValue`/`revokeSecretValue`/`recordSecretUsage` — único módulo autorizado a receber plaintext pra ESCRITA |
| `vault/vault-gate.ts` | `REAL_VAULT_BACKEND_ENABLED` — mesmo padrão do gate do Real Supabase Adapter |
| `vault/errors.ts` | `RealVaultBackendDisabledError`/`SecretVersionNotFoundError`/`SecretVersionStaleError` |
| `vault/factory.ts` | `createRealVaultBackendRuntimeVaultProvider(repos, options)` — composição de conveniência |
| `vault/simulation.ts` | 10 cenários determinísticos (`pnpm vault:simulate`) |
| `provider-credentials-runtime/providers/postgres-pgcrypto.ts` | `PostgresPgcryptoRuntimeVaultProvider` — o `RuntimeVaultProvider` real |

## Nunca no caminho default

`createDefaultRuntimeVaultProviderRegistry()` continua só com
`Noop`/`InMemory`/`Environment` — mesmo precedente do Real Supabase Adapter
não estar em `createDefaultProvisioningAdapterRegistry()`. Quem quer o
backend real chama `registerPostgresPgcryptoVaultProvider(registry, deps)`
ou `createRealVaultBackendRuntimeVaultProvider(repos)` explicitamente.
Importar qualquer módulo desta fase NUNCA toca env/rede sozinho — só chamar
`encrypt()`/`decrypt()` faz, e essas chamadas checam o gate
`REAL_VAULT_BACKEND_ENABLED` fail-closed primeiro.

## Documentos relacionados

- `threat-model.md` — as 18 ameaças pedidas, uma a uma
- `encryption.md` — por que `pgp_sym_encrypt`, o abstração `SecretEncryptionProvider`, evolução pra KMS
- `lifecycle.md` — criação → armazenamento → resolução → rotação → revogação
- `runtime-integration.md` — como isto se pluga em `withProviderCredential`
- `supabase-integration.md` — como o Real Supabase Adapter passaria a usar isto
- `operational-runbook.md` — como configurar a chave mestra, rodar `pnpm vault:simulate`
- `migration-plan.md` — o que falta pra aplicar a migration 0099 de verdade
