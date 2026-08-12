---
type: architecture
status: v1 — CRIADA, NÃO APLICADA
last_updated: 2026-08-12
---

# Migration 0098 — Control Plane Persistence + Credentials Vault

## Estado atual

**Criada e revisada, NÃO aplicada a nenhum banco.** Nesta sessão:

- Arquivo versionado: `supabase/migrations/20260811000000_0098_control_plane_persistence.sql`
- Apêndice espelho em `supabase/baseline.sql` (idêntico, precedido do
  header `-- ---- control plane persistence + credentials vault (migration 0098) ----`)
- Linha registrada em `supabase/migrations/MANIFEST.md`

**Não executado**: `supabase db push`, MCP `apply_migration`, `psql` contra
qualquer banco (efêmero ou real). Isso foi proibido explicitamente para esta
sessão — ver `runtime-boundary.md`.

## Como aplicar (quando decidido)

1. Revisar o SQL (idempotente — `create table if not exists`, `drop policy
   if exists` + `create policy`, sem `BEGIN`/`COMMIT` explícito).
2. `supabase db push` (aplica `supabase/migrations/` em ordem) OU MCP
   `apply_migration` — nunca aplicar só o apêndice do `baseline.sql`
   diretamente num banco com histórico de migration diferente.
3. Validar num Postgres descartável primeiro (`pgvector/pgvector:pg17` +
   extensões) — `install` (fresh, `ON_ERROR_STOP=1`) e `update` (re-aplicar
   sobre um banco que já tem 0001-0097, sem a flag) **ambos** têm que passar.
4. Se mudou contrato de tabela depois da revisão: regenerar
   `lib/database.types.ts`.
5. `pnpm test:db` — sobe Postgres efêmero, aplica `baseline.sql`, roda os
   364+ invariantes (incluindo isolamento RLS). Não pula esta etapa: é o
   único caminho que exercita o `baseline.sql` que o self-hoster realmente
   aplica.

## Backfill

**Nenhum.** Todas as 8 tabelas nascem vazias — não há dado legado pra
migrar/deduplicar antes de nenhuma constraint.

## Rollback (documentado, não aplicado)

Nunca editar a `0098` depois de existir (doutrina de migrations do
`CLAUDE.md`). Se precisar desfazer, uma migration forward-fix nova
(`00NN_revert_control_plane_persistence.sql`) dropando na ordem reversa de
FK:

```sql
drop table if exists public.control_plane_operation_events;
drop table if exists public.control_plane_provider_connections;
drop table if exists public.control_plane_secret_references;
drop table if exists public.control_plane_provisioning_steps;
drop table if exists public.control_plane_provisioning_runs;
drop table if exists public.control_plane_deployments;
drop table if exists public.control_plane_installations;
drop table if exists public.control_plane_tenants;
```

`fn_is_platform_admin()`/`fn_set_updated_at()` NÃO são dropadas — são
reusadas por outras tabelas do sistema (`incidents`, `organizations`,
`platform_admins`, etc.), nunca exclusivas desta migration.

O apêndice correspondente também precisaria ser removido/neutralizado do
`baseline.sql` (ou substituído por `drop table if exists` idempotente) pra
clones que ainda não aplicaram a `0098` não a receberem depois de revertida
— mas isso só se aplica se a decisão de reverter acontecer ANTES da
`0098` ser considerada estável em produção. Nenhuma dessas ações foi tomada
nesta sessão — é só o procedimento documentado.

## Confirmações desta sessão

- ✅ Migration criada como arquivo versionado
- ✅ Apêndice do `baseline.sql` atualizado (texto idêntico à migration)
- ✅ Linha no `MANIFEST.md`
- ✅ SQL revisado manualmente (idempotência, FKs, CHECKs, RLS)
- ❌ NÃO aplicada — nenhum `db push`, nenhum `apply_migration`, nenhum `psql`
- ❌ NÃO testada contra Postgres efêmero (`test:db` não executado)
- ❌ `lib/database.types.ts` NÃO regenerado (depende de aplicação real)
