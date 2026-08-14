---
type: architecture
status: v1 — não aplicado
last_updated: 2026-08-14
---

# Migration Plan — 0099_real_vault_backend

## Estado atual

**Criada, revisada, commitada em `supabase/migrations/` + apêndice
idempotente em `supabase/baseline.sql` + linha no MANIFEST.md.** NÃO
aplicada a nenhum banco — nem `supabase db push`, nem MCP
`apply_migration`, nem Postgres efêmero local (Docker fora do escopo desta
sessão, ver restrições da tarefa).

## O que a migration faz

1. Cria `control_plane_secret_ciphertexts` (RLS ligada, zero policies).
2. Cria `private.fn_vault_key()`, `public.fn_vault_encrypt_secret`,
   `public.fn_vault_decrypt_secret`, `public.fn_vault_write_secret_version`,
   `public.fn_vault_revoke_secret`.
3. Widen do CHECK `control_plane_secret_references_vault_provider_check`
   (+ `postgres_pgcrypto`).
4. `alter table ... add column if not exists last_used_at timestamptz`.

Nenhum backfill — tudo nasce vazio/NULL (não havia nenhum valor real
armazenado antes desta fase).

## Antes de aplicar (checklist)

- [ ] `pnpm test:db` verde localmente — instala + atualiza o `baseline.sql`
      num Postgres `pg17` efêmero (install `ON_ERROR_STOP=1` + update sem a
      flag), incluindo o apêndice desta migration. **Não rodado nesta
      sessão** (Docker fora de escopo).
- [ ] Revisão humana do SQL (especialmente as 3 funções `SECURITY
      DEFINER`/`plpgsql` novas — `fn_vault_write_secret_version` é a mais
      complexa, com `SELECT ... FOR UPDATE`).
- [ ] Confirmar que `pgcrypto`/schema `extensions` já existem no ambiente
      alvo (deveriam, desde a migration 0041 — a 0099 não recria).
- [ ] Decidir ONDE a chave mestra vai viver no ambiente alvo (GUC vs.
      `private.app_secrets` — ver `operational-runbook.md` §2) ANTES de
      aplicar, pra não ter uma tabela pronta sem chave configurada por
      semanas.

## Depois de aplicar

- [ ] Regenerar `lib/database.types.ts` (rotina padrão — o repo hoje NÃO
      inclui tipos de `control_plane_*` porque a migration 0098 também
      nunca foi aplicada; `DatabaseSecretReferenceRepository`/etc. usam
      tipos manuais em `mappers/persistence.ts`, então a app funciona sem
      os tipos gerados — mas regenerar é a rotina correta).
- [ ] Rodar `pnpm vault:simulate` de novo (deve continuar 100% in-memory —
      não deveria mudar de comportamento só por a tabela existir).
- [ ] Configurar a chave mestra (runbook §2) e provar o roundtrip
      (`fn_vault_encrypt_secret`/`fn_vault_decrypt_secret`) com um valor
      sintético via SQL direto ANTES de ligar `REAL_VAULT_BACKEND_ENABLED`.
- [ ] Só então ligar o gate e registrar o provider (runbook §3-4).

## Rollback (documentado, não implementado/testado)

A migration é só ADITIVA (tabela nova, funções novas, coluna nova, CHECK
mais permissivo) — nenhuma coluna/tabela existente é removida ou
restringida. Um rollback teórico seria:

```sql
drop function if exists public.fn_vault_revoke_secret(uuid);
drop function if exists public.fn_vault_write_secret_version(uuid, bytea, text, text);
drop function if exists public.fn_vault_decrypt_secret(bytea);
drop function if exists public.fn_vault_encrypt_secret(text);
drop function if exists private.fn_vault_key();
drop table if exists public.control_plane_secret_ciphertexts;
alter table public.control_plane_secret_references drop column if exists last_used_at;
alter table public.control_plane_secret_references drop constraint if exists control_plane_secret_references_vault_provider_check;
alter table public.control_plane_secret_references add constraint control_plane_secret_references_vault_provider_check
  check (vault_provider in ('noop', 'in_memory', 'database_placeholder'));
```

**NUNCA testado nesta sessão.** Se alguma reference já tiver
`vault_provider = 'postgres_pgcrypto'` no momento do rollback, o `ADD
CONSTRAINT` final falharia (dado violando o CHECK mais restrito) — o
rollback real precisaria primeiro migrar/revogar essas referências. Isso é
esperado de qualquer rollback que remove um backend com dado já em uso —
documentado aqui como aviso, não como bloqueio (a migration em si nunca foi
aplicada, então não há dado real pra se preocupar hoje).

## Limitações conhecidas (herdadas, não desta fase)

- `DatabaseSecretReferenceRepository.rotateReference` (migration 0098) usa
  leitura-then-escrita sem lock — race teórica no CAMPO DE METADATA
  (`version`) sob rotação concorrente via esse caminho específico. Ver
  `threat-model.md` §17. Corrigir é trabalho futuro, fora do escopo desta
  sessão (não introduzido por ela).
- Nenhuma UI de cadastro/rotação de valor foi implementada — ver
  `supabase-integration.md` §"Avaliação: UI de cadastro".
