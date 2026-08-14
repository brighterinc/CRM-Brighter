---
type: runbook
status: v1 — não aplicado
last_updated: 2026-08-14
---

# Operational Runbook — Real Vault Backend

> Nada aqui foi executado nesta sessão — é o runbook pra quando a migration
> `0099_real_vault_backend` for aplicada e o backend for ligado de verdade.

## 1. Aplicar a migration (fora desta sessão)

```bash
# Revisar primeiro: supabase/migrations/20260814000000_0099_real_vault_backend.sql
supabase db push   # ou mcp__plugin_supabase_supabase__apply_migration
```

Validar ANTES em Postgres descartável (`pgvector/pgvector:pg17`), install +
update do `baseline.sql` — ver `docs/harness-audit.md`/CLAUDE.md §Migrations.

## 2. Configurar a chave mestra

**NUNCA em `.env`/`.env.local` de produção.** Duas opções, em ordem de
preferência:

### Opção A — GUC (self-host VPS, Postgres próprio)

```sql
ALTER DATABASE postgres SET app.brighter_vault_key = '<64+ chars aleatórios>';
```

Gerar a chave: `openssl rand -base64 48` (ou equivalente — precisa ter
`length(k) >= 32`, checado por `fn_vault_encrypt_secret`/
`fn_vault_decrypt_secret`, que lançam se faltar).

### Opção B — `private.app_secrets` (Supabase cloud gerenciado)

Supabase cloud bloqueia `ALTER DATABASE ... SET` de GUC custom (`42501`).
Nesse caso:

```sql
insert into private.app_secrets (name, value)
values ('brighter_vault_key', '<64+ chars aleatórios>')
on conflict (name) do update set value = excluded.value, updated_at = now();
```

Rodar isso via `service_role`/dashboard SQL editor — NUNCA através de uma
rota da aplicação.

## 3. Ligar o gate

```bash
# .env de produção — nunca .env.example, nunca commitado
REAL_VAULT_BACKEND_ENABLED=true
```

Confirmar: `pnpm typecheck` continua passando sem essa variável setada (o
gate é lido direto de `process.env`, nunca via `lib/env.ts` no caminho
quente — ver `vault-gate.ts`).

## 4. Registrar o provider no boot real da app

Nenhum código de boot foi criado nesta fase (fora de escopo — não existe
ainda um composition root único pra runtime deps de produção). Quando esse
composition root existir, adicionar:

```typescript
import { registerPostgresPgcryptoVaultProvider } from "@/lib/provider-credentials-runtime/providers";
import { createRealVaultBackendRuntimeVaultProvider } from "@/lib/control-plane-persistence/vault/factory";

registerPostgresPgcryptoVaultProvider(registry, {
  payloadRepository: new DatabaseSecretPayloadRepository(),
  encryptionProvider: new PgcryptoSecretEncryptionProvider(),
});
```

## 5. Provar o roundtrip com um valor sintético (nunca produção)

```sql
-- via service_role, nunca client comum
select public.fn_vault_encrypt_secret('valor-de-teste-nao-real');
-- copiar o bytea retornado
select public.fn_vault_decrypt_secret('<bytea copiado>'::bytea);
-- deve devolver 'valor-de-teste-nao-real'
```

## 6. `pnpm vault:simulate` — smoke test 100% in-memory (sempre seguro rodar)

```bash
pnpm vault:simulate -- --scenario all --format markdown
```

Não requer chave mestra, não requer migration aplicada, não toca Postgres.
Roda os 10 cenários com `FakeSecretEncryptionProvider` — é o teste "o
FLUXO está correto", não "a chave mestra está configurada".

## 7. Rotação de chave mestra (procedimento manual, não automatizado)

1. Gerar nova chave.
2. Job (não existe ainda — trabalho futuro): pra cada
   `control_plane_secret_ciphertexts` com `key_id = '<antigo>'`, decifrar
   com a chave antiga, recifrar com a nova, `UPDATE ... SET ciphertext =
   ..., key_id = '<novo>'`.
3. Só depois de 100% migrado, trocar `private.fn_vault_key()`/GUC pra
   remover a chave antiga.

## 8. O que fazer se a chave mestra for perdida

**Nenhum segredo cifrado com ela é recuperável** (mesma doutrina do
retrofit 0041 — "secrets plaintext existentes NÃO são recuperáveis com
segurança"). Procedimento: revogar todas as `control_plane_secret_references`
com `vaultProvider: "postgres_pgcrypto"` afetadas (`revokeSecretValue`),
notificar os clientes afetados, re-cadastrar credenciais novas sob uma nova
chave.

## 9. Diagnóstico rápido

| Sintoma | Causa provável |
|---|---|
| `RealVaultBackendDisabledError` | `REAL_VAULT_BACKEND_ENABLED` não é `"true"` no processo |
| `BRIGHTER_VAULT_ENCRYPTION_KEY ausente` (erro do Postgres) | Nem GUC nem `private.app_secrets` têm a chave, ou tem menos de 32 chars |
| `SecretVersionStaleError` | `control_plane_secret_references.version` diverge da versão ativa em `control_plane_secret_ciphertexts` — investigar se `fn_vault_write_secret_version` rodou sem o bump de metadata correspondente (ver `threat-model.md` §17) |
| `secret_resolution_failed: reference_not_found` (via `getActiveCiphertext`) | Reference criada mas `storeSecretValue` nunca foi chamado |
