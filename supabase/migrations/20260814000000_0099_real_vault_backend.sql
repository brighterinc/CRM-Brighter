-- 0099 — Real Vault Backend: primeiro backend REAL do Credentials Vault
-- (`vault_provider: "postgres_pgcrypto"`). Ver ROADMAP.md §"Vault Backend
-- Real" e docs/vault-backend/*.
--
-- ── Por que uma tabela NOVA (`control_plane_secret_ciphertexts`), nunca
--    coluna em `control_plane_secret_references` ──────────────────────────
-- `control_plane_secret_references` (migration 0098) é METADATA PÚBLICA por
-- desenho — qualquer platform-admin lê via RLS `fn_is_platform_admin()`.
-- Ciphertext é OUTRA categoria de dado (payload cifrado), com OUTRO
-- controle de acesso (ver RLS abaixo — NENHUMA policy, nem platform-admin).
-- Misturar as duas na mesma tabela tornaria impossível dar visibilidade de
-- metadata sem também expor a coluna de ciphertext pra quem só devia ver
-- "esta referência existe, versão 3, ativa".
--
-- ── Por que funções PRÓPRIAS (`fn_vault_encrypt_secret`/`fn_vault_decrypt_secret`),
--    nunca `fn_encrypt_oauth`/`fn_decrypt_oauth` do Nuvemshop (migration 0006/0041) ──
-- Mesmo padrão de infra (`pgp_sym_encrypt`/`pgp_sym_decrypt`, chave via GUC
-- com fallback em `private.app_secrets`), mas escopo/chave/função SEPARADOS
-- — doutrina explícita do ROADMAP: "função SECURITY DEFINER própria, nunca
-- reusando as do Nuvemshop". Reusar a mesma chave acoplaria a rotação da
-- chave mestra do Nuvemshop (que já tem seu próprio ciclo de vida) à do
-- Vault Backend da Control Plane — dois domínios de segredo completamente
-- diferentes (OAuth de app de cliente vs. credencial de provisionamento
-- White Label). `private.app_secrets` (tabela genérica key-value, já
-- existente desde 0041) É reusada — não é específica do Nuvemshop, é a
-- infra de "onde vive uma chave mestra fora do banco de dados versionado"
-- — mas com uma LINHA distinta (`brighter_vault_key`) e uma FUNÇÃO leitora
-- distinta (`private.fn_vault_key()`, nunca `private.fn_oauth_key()`).
--
-- ── Versionamento: uma linha por versão, não UPDATE no lugar ──────────────
-- `control_plane_secret_ciphertexts` guarda uma linha POR VERSÃO
-- (`unique(secret_reference_id, version)`), com `status` `active`/
-- `superseded`/`revoked`. Rotação NUNCA sobrescreve — supersede a ativa e
-- insere uma nova. `control_plane_secret_ciphertexts_active_uniq` (unique
-- index PARCIAL, `where status = 'active'`) garante NO MÁXIMO uma versão
-- ativa por reference — é o mesmo invariante que
-- `fn_vault_write_secret_version` usa `SELECT ... FOR UPDATE` na reference
-- pai pra proteger sob rotação concorrente (duas chamadas concorrentes
-- serializam: a segunda só lê o "próximo número de versão" depois que a
-- primeira commitou).
--
-- ── RLS: NENHUMA policy em `control_plane_secret_ciphertexts` ─────────────
-- Diferente das 8 tabelas de metadata da migration 0098 (`FOR ALL USING
-- fn_is_platform_admin()`), esta tabela fica com RLS LIGADA e ZERO
-- policies — mesmo padrão de `system_version` (migration 0089): nega TUDO
-- pra TODO mundo, inclusive platform-admin autenticado via browser. Só
-- `service_role` (que ignora RLS por natureza no Supabase) lê/escreve, e só
-- através de `DatabaseSecretPayloadRepository`
-- (`lib/control-plane-persistence/vault/secret-payload-database.ts`) — o
-- ÚNICO código que importa esta tabela. Isso é deliberado: "platform-admin
-- não deve automaticamente significar acesso ao valor secreto" (requisito
-- do threat model, ver docs/vault-backend/threat-model.md) — RLS não separa
-- COLUNA (não dá pra esconder só `ciphertext` com uma policy normal), então
-- a única forma de nunca vazar o ciphertext pra uma sessão autenticada
-- comum é não dar NENHUM acesso de linha a ela.
--
-- ── Idempotente, portável em psql puro, sem BEGIN/COMMIT explícito ────────
-- Mesmo padrão das migrations anteriores — `create table if not exists`,
-- `create or replace function`, `drop constraint if exists` + `add
-- constraint`, `add column if not exists`.
--
-- Backfill: nenhum — `control_plane_secret_ciphertexts` nasce vazia
-- (nenhuma reference existente tinha valor real armazenado; `last_used_at`
-- nasce NULL em todas as referências já existentes).

-- ---------------------------------------------------------------------------
-- control_plane_secret_ciphertexts — o ENCRYPTED SECRET PAYLOAD, separado
-- da metadata (control_plane_secret_references, migration 0098).
-- ---------------------------------------------------------------------------
create table if not exists public.control_plane_secret_ciphertexts (
  id uuid primary key default gen_random_uuid(),
  secret_reference_id uuid not null references public.control_plane_secret_references(id) on delete cascade,
  version integer not null,
  status text not null default 'active',
  ciphertext bytea not null,
  encryption_scheme text not null default 'pgcrypto_aes256',
  key_id text not null default 'default',
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  revoked_at timestamptz,
  constraint control_plane_secret_ciphertexts_status_check check (status in ('active', 'superseded', 'revoked')),
  constraint control_plane_secret_ciphertexts_version_positive_check check (version > 0),
  constraint control_plane_secret_ciphertexts_reference_version_uniq unique (secret_reference_id, version)
);

comment on table public.control_plane_secret_ciphertexts is
  'Real Vault Backend (migration 0099) — ENCRYPTED SECRET PAYLOAD, uma linha por versão. NUNCA junta com control_plane_secret_references (metadata pública) — RLS aqui é ZERO policies, nem platform-admin. Só service_role, só via DatabaseSecretPayloadRepository.';
comment on column public.control_plane_secret_ciphertexts.ciphertext is
  'Saída de public.fn_vault_encrypt_secret() — pgp_sym_encrypt com chave em private.fn_vault_key(). NUNCA lido fora de PostgresPgcryptoRuntimeVaultProvider.resolveSecret().';
comment on column public.control_plane_secret_ciphertexts.key_id is
  'Identifica qual chave mestra cifrou este payload — prepara rotação de CHAVE MESTRA futura (distinta de rotação de SEGREDO, que é uma versão nova nesta mesma tabela). Nesta fase sempre "default".';

create unique index if not exists control_plane_secret_ciphertexts_active_uniq
  on public.control_plane_secret_ciphertexts (secret_reference_id)
  where status = 'active';
create index if not exists control_plane_secret_ciphertexts_reference_idx
  on public.control_plane_secret_ciphertexts (secret_reference_id);

alter table public.control_plane_secret_ciphertexts enable row level security;
revoke all on public.control_plane_secret_ciphertexts from anon;
revoke all on public.control_plane_secret_ciphertexts from authenticated;
-- Sem NENHUMA policy — RLS ligada nega tudo por padrão, inclusive platform-admin. Ver nota acima.

-- ---------------------------------------------------------------------------
-- Chave mestra: reusa o schema/tabela GENÉRICOS já existentes (private.app_secrets,
-- migration 0041) com uma linha e uma função leitora PRÓPRIAS — nunca as do
-- Nuvemshop (fn_oauth_key).
-- ---------------------------------------------------------------------------
create schema if not exists private;
create table if not exists private.app_secrets (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
revoke all on schema private from public;
revoke all on all tables in schema private from public;

create or replace function private.fn_vault_key() returns text
    language sql security definer
    set search_path to 'private', 'pg_temp'
    as $$
  select coalesce(
    nullif(current_setting('app.brighter_vault_key', true), ''),
    (select value from private.app_secrets where name = 'brighter_vault_key')
  );
$$;
revoke all on function private.fn_vault_key() from public;

-- ---------------------------------------------------------------------------
-- fn_vault_encrypt_secret / fn_vault_decrypt_secret — próprias, nunca
-- reusando fn_encrypt_oauth/fn_decrypt_oauth.
-- ---------------------------------------------------------------------------
create or replace function public.fn_vault_encrypt_secret(plaintext text) returns bytea
    language plpgsql security definer
    set search_path to 'public', 'private', 'extensions', 'pg_temp'
    as $$
declare
  k text := private.fn_vault_key();
begin
  if k is null or length(k) < 32 then
    raise exception 'BRIGHTER_VAULT_ENCRYPTION_KEY ausente';
  end if;
  return pgp_sym_encrypt(plaintext, k, 'cipher-algo=aes256');
end$$;

create or replace function public.fn_vault_decrypt_secret(ciphertext bytea) returns text
    language plpgsql security definer
    set search_path to 'public', 'private', 'extensions', 'pg_temp'
    as $$
declare
  k text := private.fn_vault_key();
begin
  if k is null or length(k) < 32 then
    raise exception 'BRIGHTER_VAULT_ENCRYPTION_KEY ausente';
  end if;
  return pgp_sym_decrypt(ciphertext, k);
end$$;

revoke all on function public.fn_vault_encrypt_secret(text) from public;
revoke all on function public.fn_vault_decrypt_secret(bytea) from public;
grant execute on function public.fn_vault_encrypt_secret(text) to service_role;
grant execute on function public.fn_vault_decrypt_secret(bytea) to service_role;

-- ---------------------------------------------------------------------------
-- fn_vault_write_secret_version — escreve a PRIMEIRA versão OU rotaciona,
-- atomicamente. `SELECT ... FOR UPDATE` na reference pai serializa chamadas
-- concorrentes pra MESMA secret_reference_id.
-- ---------------------------------------------------------------------------
create or replace function public.fn_vault_write_secret_version(
  p_secret_reference_id uuid,
  p_ciphertext bytea,
  p_encryption_scheme text default 'pgcrypto_aes256',
  p_key_id text default 'default'
) returns public.control_plane_secret_ciphertexts
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
declare
  v_next_version integer;
  v_row public.control_plane_secret_ciphertexts;
begin
  perform 1 from public.control_plane_secret_references where id = p_secret_reference_id for update;
  if not found then
    raise exception 'secret_reference_not_found: %', p_secret_reference_id;
  end if;

  update public.control_plane_secret_ciphertexts
    set status = 'superseded', superseded_at = now()
    where secret_reference_id = p_secret_reference_id and status = 'active';

  select coalesce(max(version), 0) + 1 into v_next_version
    from public.control_plane_secret_ciphertexts
    where secret_reference_id = p_secret_reference_id;

  insert into public.control_plane_secret_ciphertexts
    (secret_reference_id, version, status, ciphertext, encryption_scheme, key_id)
  values (p_secret_reference_id, v_next_version, 'active', p_ciphertext, p_encryption_scheme, p_key_id)
  returning * into v_row;

  update public.control_plane_secret_references
    set version = v_next_version,
        status = 'active',
        rotated_at = case when v_next_version > 1 then now() else rotated_at end
    where id = p_secret_reference_id;

  return v_row;
end;
$$;

revoke all on function public.fn_vault_write_secret_version(uuid, bytea, text, text) from public;
grant execute on function public.fn_vault_write_secret_version(uuid, bytea, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- fn_vault_revoke_secret — marca a versão ativa (se houver) revogada.
-- Idempotente: chamar de novo numa reference já sem versão ativa é no-op.
-- ---------------------------------------------------------------------------
create or replace function public.fn_vault_revoke_secret(p_secret_reference_id uuid) returns void
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
  update public.control_plane_secret_ciphertexts
    set status = 'revoked', revoked_at = now()
    where secret_reference_id = p_secret_reference_id and status = 'active';
end;
$$;

revoke all on function public.fn_vault_revoke_secret(uuid) from public;
grant execute on function public.fn_vault_revoke_secret(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- control_plane_secret_references: widen vault_provider CHECK (+
-- "postgres_pgcrypto") e novo last_used_at.
-- ---------------------------------------------------------------------------
alter table public.control_plane_secret_references drop constraint if exists control_plane_secret_references_vault_provider_check;
alter table public.control_plane_secret_references add constraint control_plane_secret_references_vault_provider_check
  check (vault_provider in ('noop', 'in_memory', 'database_placeholder', 'postgres_pgcrypto'));

alter table public.control_plane_secret_references add column if not exists last_used_at timestamptz;

comment on column public.control_plane_secret_references.last_used_at is
  'Última resolução de VALOR bem-sucedida (bump via SecretUsageRecorder.recordUsage, migration 0099) — telemetria, nunca gera api_audit_log (alta frequência). NULL = nunca resolvida.';
