---
type: architecture
status: v1 — sem backend real
last_updated: 2026-08-12
---

# Credentials Vault

> `lib/control-plane-persistence/vault/`. Gerencia **referências** de
> segredo — nunca o valor.

## O contrato

```typescript
interface CredentialsVault {
  createReference(input: CreateSecretReferenceInput): Promise<SecretReferenceMetadata>;
  resolveReferenceMetadata(id: string): Promise<SecretReferenceMetadata | null>;
  rotateReference(id: string): Promise<SecretReferenceMetadata>;
  revokeReference(id: string): Promise<SecretReferenceMetadata>;
  validateReference(id: string): Promise<{ valid: boolean; errors: string[] }>;
}
```

**Não existe `getSecretValue()`.** Não é omissão — é a garantia estrutural:
se o valor nunca pode ser lido pelo domínio através desta interface, não tem
como um chamador de boa-fé vazá-lo sem querer. Nenhuma das 3 implementações
desta fase quebra isso.

## As 3 implementações

| Classe | Onde | Uso |
|---|---|---|
| `NoopCredentialsVault` | `vault/noop.ts` | Default seguro — toda operação lança `VaultDisabledError`. Fail-closed explícito pra quem esqueceu de configurar um vault. |
| `InMemoryCredentialsVault` | `vault/in-memory.ts` | Demonstração/teste — `Map` local, nunca singleton global. Usada por `pnpm control:persistence`. |
| `DatabaseSecretReferenceRepository` | `vault/database.ts` | Real (Supabase) — grava em `control_plane_secret_references`. |

## O que a tabela guarda (e o que NUNCA guarda)

Guarda: `reference` (id opaco pro chamador), `type` (`api_key`/`oauth_token`/
`database_password`/`ssh_key`/`webhook_secret`/`service_account`/
`tls_certificate`/`other`), `provider`, `vault_provider`, `vault_key`
(ponteiro OPACO pro backend do vault), `version`, `status`
(`pending`/`active`/`rotated`/`revoked`), datas.

**Nunca**: token, senha, API key em claro, service_role, chave privada, SSH
key, connection string, cookie, session token, webhook secret EM SI (só a
*referência* a ele). Reforçado em código por `assertSafePersistencePayload`
(`../safe-persistence.ts`) — roda ANTES de todo `createReference()`, em
qualquer implementação, e recusa (não mascara) qualquer payload com chave
sensível em qualquer profundidade.

## `vault_provider` nesta fase

Fechado a `noop`/`in_memory`/`database_placeholder` (CHECK na tabela) —
**nenhum guarda valor de verdade**. `database_placeholder` existe como
literal reservado pro dia em que um backend real for ligado; hoje nenhuma
implementação o usa de fato para armazenar segredo (só marca a intenção).

## O backend real (fase futura, NÃO implementado aqui)

Já existe precedente no banco: `fn_encrypt_oauth`/`fn_decrypt_oauth`
(`supabase/baseline.sql`, migration 0006), usado pelo OAuth do Nuvemshop —
`pgp_sym_encrypt`/`pgp_sym_decrypt` com chave em `current_setting('app.nuvemshop_oauth_key')`,
`REVOKE ALL ... FROM PUBLIC` + `GRANT ... TO service_role` (só o backend
decifra). Um `vaultProvider: "postgres_pgcrypto"` real seguiria o MESMO
padrão — mas isso exige uma migration própria (nova função de
encrypt/decrypt escopada pra Control Plane, coluna de ciphertext em tabela
separada da de metadata, nunca em `control_plane_secret_references`) e está
fora do escopo desta fase. Ver `runtime-boundary.md`.

## Auditoria — o que sai no log, o que fica de fora

`services.ts::recordSecretReference` grava em `api_audit_log` e
`control_plane_operation_events` um subconjunto DELIBERADO da metadata —
`type`/`provider`/`vault_provider`, **nunca `vaultKey`** (mesmo sendo, por
doutrina, sempre um ponteiro opaco nunca o segredo em si — um log retido 5
anos não precisa dele; menos superfície é sempre melhor).
