-- 0098 — Control Plane Persistence + Credentials Vault.
--
-- Dá persistência real (Supabase, banco PRÓPRIO da Brighter — nunca dentro
-- do banco de um tenant) às fundações "Foundation v1" que hoje só existem
-- in-memory: `lib/tenants`, `lib/control-plane`, `lib/deployment` (histórico
-- de manifesto), `lib/provisioning` (runs/steps), `lib/provisioning-adapters`
-- (conexões de provider) — mais o Credentials Vault, que é NOVO nesta fase
-- (não existia nem em memória antes).
--
-- ── Por que NENHUMA destas 8 tabelas tem `organization_id` ────────────────
-- `organization_id` é doutrina pra dado de TENANT da CRM (contacts, leads,
-- conversas — RLS por `fn_user_org_ids()`). Control Plane é o INVERSO: é a
-- Brighter observando de FORA todas as instalações White Label — o
-- `control_plane_tenants` daqui é o CLIENTE da Brighter, não um
-- `organizations` desta CRM. Mesma classe de tabela que `incidents`
-- (migration 0021) e `system_version`/`system_update_runs` (migration
-- 0089): instância/plataforma, não inquilino. Seguimos o padrão de
-- `incidents` — RLS LIGADA, restrita a `fn_is_platform_admin()` — e não o de
-- `system_version` (RLS ligada sem NENHUMA policy), porque aqui platform
-- admins precisam ler/escrever pela UI, não só pela rota de sistema.
--
-- ── `deployment`/`branding`/`modules`/`deploymentPlan` NÃO viram coluna em
--    `control_plane_installations` ─────────────────────────────────────────
-- São sempre derivados do `tenant` (já com manifesto anexado) via
-- `deriveInstallationFromTenant` (`lib/control-plane/repository.ts`,
-- exportada desta fase por este motivo) — persistir como coluna duplicaria
-- uma fonte de verdade que já existe no tenant (anti-padrão nº2 do
-- CLAUDE.md). `control_plane_deployments` é outra coisa: um HISTÓRICO
-- versionado de manifesto gerado, não a view "atual" — mesmo espírito de
-- `meta_templates` ("espelho, nunca autoritativo").
--
-- ── Credentials Vault: NENHUMA coluna guarda segredo ───────────────────────
-- `control_plane_secret_references` só tem referência/tipo/provider/
-- vault_provider/vault_key/versão/status — nunca token, senha, chave, ssh
-- key, service_role, connection string. `vault_provider` desta fase é
-- fechado a `noop`/`in_memory`/`database_placeholder` — nenhum guarda valor
-- de verdade. Um backend real (ex.: Postgres `pgp_sym_encrypt`, que já
-- existe pra OAuth do Nuvemshop em `fn_encrypt_oauth`/`fn_decrypt_oauth`,
-- migration 0006) é trabalho de fase futura — ver
-- docs/control-plane-persistence/runtime-boundary.md. Reforço em código:
-- `assertSafePersistencePayload` (`lib/control-plane-persistence/safe-persistence.ts`)
-- recusa (fail-closed) qualquer payload com chave sensível antes do INSERT.
--
-- ── FKs: CASCADE pra "estado atual", SET NULL pra "trilha/histórico" ──────
-- `installations`/`deployments`/`provisioning_runs`/`provisioning_steps`/
-- `provider_connections` cascateiam com o pai — sem ele não significam nada.
-- `secret_references`/`operation_events` usam SET NULL: apagar uma
-- instalação não pode apagar em silêncio o ponteiro de um segredo que ainda
-- existe no vault real, nem o rastro de auditoria (anti-padrão nº7,
-- "cascade fantasma" — mesma doutrina de nunca cascatear audit log).
--
-- ── Vocabulário: CHECK fechado nos que SÃO nossos, sem CHECK nos abertos ──
-- Toda coluna abaixo com CHECK espelha um union TypeScript fechado, emitido
-- por UM lugar só no nosso código (mesma doutrina de `meta_templates.parameter_format`).
-- Exceção deliberada: `control_plane_operation_events.event_type` fica SEM
-- CHECK — vocabulário ABERTO, porque cada runtime real futuro
-- (provisioning/monitoring/billing) vai somar tipos de evento novos, e
-- exigir migration por evento pontual é exatamente o dano que essa exceção
-- (mesma de `crm_lead_activities.type`) existe para evitar. O vocabulário de
-- referência vive em `CONTROL_PLANE_OPERATION_EVENT_TYPES`
-- (`lib/control-plane-persistence/types.ts`), o emissor usa constante
-- compartilhada, nunca string literal solta.
--
-- Backfill: nenhum, por construção — todas as 8 tabelas nascem vazias.

-- ---------------------------------------------------------------------------
-- control_plane_tenants
-- ---------------------------------------------------------------------------
create table if not exists public.control_plane_tenants (
  id uuid primary key default gen_random_uuid(),
  client_slug text not null,
  client_name text not null,
  legal_name text,
  domain text not null,
  plan text not null,
  requested_modules text[] not null default '{}',
  enabled_modules text[] not null default '{}',
  branding jsonb not null default '{}',
  commercial_status text not null,
  technical_status text not null,
  primary_contact jsonb,
  account_manager jsonb,
  infrastructure jsonb,
  supabase_ref jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint control_plane_tenants_client_slug_format check (client_slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  constraint control_plane_tenants_plan_check check (plan in ('lite', 'pro', 'dedicated')),
  constraint control_plane_tenants_commercial_status_check check (
    commercial_status in ('lead', 'proposal', 'contracted', 'onboarding', 'active', 'suspended', 'cancelled')
  ),
  constraint control_plane_tenants_technical_status_check check (
    technical_status in (
      'draft', 'configuration_pending', 'ready_to_provision', 'provisioning',
      'validation', 'live', 'degraded', 'archived'
    )
  )
);

comment on table public.control_plane_tenants is
  'Cliente White Label da Brighter (Tenant Engine persistido, migration 0098). Nunca guarda segredo — só referência pública de infra/Supabase. Espelha lib/tenants/types.ts::Tenant, exceto .manifest (vive em control_plane_deployments).';

create unique index if not exists control_plane_tenants_client_slug_uniq on public.control_plane_tenants (client_slug);
create index if not exists control_plane_tenants_commercial_status_idx on public.control_plane_tenants (commercial_status);
create index if not exists control_plane_tenants_technical_status_idx on public.control_plane_tenants (technical_status);

alter table public.control_plane_tenants enable row level security;
revoke all on public.control_plane_tenants from anon;

drop policy if exists platform_admin_only_control_plane_tenants on public.control_plane_tenants;
create policy platform_admin_only_control_plane_tenants on public.control_plane_tenants
  for all
  using (public.fn_is_platform_admin())
  with check (public.fn_is_platform_admin());

drop trigger if exists trg_control_plane_tenants_updated_at on public.control_plane_tenants;
create trigger trg_control_plane_tenants_updated_at
  before update on public.control_plane_tenants
  for each row execute function public.fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- control_plane_installations
-- ---------------------------------------------------------------------------
create table if not exists public.control_plane_installations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.control_plane_tenants(id) on delete cascade,
  slug text not null,
  company text not null,
  status text not null,
  commercial text not null,
  technical text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint control_plane_installations_status_check check (
    status in (
      'planned', 'provisioning', 'deploying', 'waiting_dns', 'waiting_ssl',
      'waiting_customer', 'active', 'maintenance', 'paused', 'archived', 'error'
    )
  ),
  constraint control_plane_installations_commercial_check check (
    commercial in ('lead', 'proposal', 'contract', 'payment_pending', 'implementation', 'production', 'cancelled')
  ),
  constraint control_plane_installations_technical_check check (
    technical in ('draft', 'validated', 'ready', 'deploying', 'running', 'warning', 'failed')
  )
);

comment on table public.control_plane_installations is
  'Instalação White Label = 1 control_plane_tenants + manifesto + provisionamento, todos DERIVADOS do tenant em runtime (migration 0098). deployment/branding/modules NUNCA são coluna aqui — ver deriveInstallationFromTenant em lib/control-plane/repository.ts.';
comment on column public.control_plane_installations.commercial is
  'Vocabulário PRÓPRIO da Installation (visão da Brighter sobre a instalação) — distinto de control_plane_tenants.commercial_status (visão do tenant sobre si mesmo). Mesmos nomes de estado, listas diferentes por desenho — ver lib/control-plane/types.ts.';
comment on column public.control_plane_installations.technical is
  'Vocabulário PRÓPRIO da Installation — distinto de control_plane_tenants.technical_status. Ver comentário de .commercial.';

create unique index if not exists control_plane_installations_slug_uniq on public.control_plane_installations (slug);
create index if not exists control_plane_installations_tenant_id_idx on public.control_plane_installations (tenant_id);
create index if not exists control_plane_installations_status_idx on public.control_plane_installations (status);

alter table public.control_plane_installations enable row level security;
revoke all on public.control_plane_installations from anon;

drop policy if exists platform_admin_only_control_plane_installations on public.control_plane_installations;
create policy platform_admin_only_control_plane_installations on public.control_plane_installations
  for all
  using (public.fn_is_platform_admin())
  with check (public.fn_is_platform_admin());

drop trigger if exists trg_control_plane_installations_updated_at on public.control_plane_installations;
create trigger trg_control_plane_installations_updated_at
  before update on public.control_plane_installations
  for each row execute function public.fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- control_plane_deployments — histórico de DeploymentManifest gerado
-- ---------------------------------------------------------------------------
create table if not exists public.control_plane_deployments (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid references public.control_plane_installations(id) on delete cascade,
  tenant_id uuid references public.control_plane_tenants(id) on delete cascade,
  target text not null,
  plan text not null,
  manifest_fingerprint text not null,
  manifest_snapshot jsonb not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint control_plane_deployments_target_check check (target in ('vercel', 'cloudflare', 'vps')),
  constraint control_plane_deployments_plan_check check (plan in ('lite', 'pro', 'dedicated'))
);

comment on table public.control_plane_deployments is
  'Snapshot histórico do DeploymentManifest gerado pra uma installation num instante (migration 0098). Espelho, NUNCA autoritativo — mesma doutrina de meta_templates. manifest_snapshot já passou por assertSafePersistencePayload, nunca segredo.';

create index if not exists control_plane_deployments_installation_generated_idx
  on public.control_plane_deployments (installation_id, generated_at desc);
create index if not exists control_plane_deployments_tenant_id_idx on public.control_plane_deployments (tenant_id);

alter table public.control_plane_deployments enable row level security;
revoke all on public.control_plane_deployments from anon;

drop policy if exists platform_admin_only_control_plane_deployments on public.control_plane_deployments;
create policy platform_admin_only_control_plane_deployments on public.control_plane_deployments
  for all
  using (public.fn_is_platform_admin())
  with check (public.fn_is_platform_admin());

-- ---------------------------------------------------------------------------
-- control_plane_provisioning_runs
-- ---------------------------------------------------------------------------
create table if not exists public.control_plane_provisioning_runs (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.control_plane_installations(id) on delete cascade,
  tenant_id uuid not null references public.control_plane_tenants(id) on delete cascade,
  plan text not null,
  target text not null,
  manifest_fingerprint text not null,
  status text not null,
  blockers jsonb not null default '[]',
  warnings jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint control_plane_provisioning_runs_plan_check check (plan in ('lite', 'pro', 'dedicated')),
  constraint control_plane_provisioning_runs_target_check check (target in ('vercel', 'cloudflare', 'vps')),
  constraint control_plane_provisioning_runs_status_check check (
    status in ('draft', 'ready', 'blocked', 'running', 'completed', 'failed', 'rolling_back', 'rolled_back')
  )
);

comment on table public.control_plane_provisioning_runs is
  'ProvisioningPlan persistido (migration 0098) — espelha lib/provisioning/types.ts::ProvisioningPlan, exceto .steps (normalizado em control_plane_provisioning_steps).';

create index if not exists control_plane_provisioning_runs_installation_created_idx
  on public.control_plane_provisioning_runs (installation_id, created_at desc);
create index if not exists control_plane_provisioning_runs_status_idx on public.control_plane_provisioning_runs (status);

alter table public.control_plane_provisioning_runs enable row level security;
revoke all on public.control_plane_provisioning_runs from anon;

drop policy if exists platform_admin_only_control_plane_provisioning_runs on public.control_plane_provisioning_runs;
create policy platform_admin_only_control_plane_provisioning_runs on public.control_plane_provisioning_runs
  for all
  using (public.fn_is_platform_admin())
  with check (public.fn_is_platform_admin());

drop trigger if exists trg_control_plane_provisioning_runs_updated_at on public.control_plane_provisioning_runs;
create trigger trg_control_plane_provisioning_runs_updated_at
  before update on public.control_plane_provisioning_runs
  for each row execute function public.fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- control_plane_provisioning_steps
-- ---------------------------------------------------------------------------
create table if not exists public.control_plane_provisioning_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.control_plane_provisioning_runs(id) on delete cascade,
  step_id text not null,
  category text not null,
  status text not null,
  blockers jsonb not null default '[]',
  warnings jsonb not null default '[]',
  started_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint control_plane_provisioning_steps_category_check check (
    category in (
      'validation', 'branding', 'database', 'authentication', 'storage', 'application',
      'domain', 'ssl', 'email', 'whatsapp', 'ai', 'monitoring', 'backup', 'handoff'
    )
  ),
  constraint control_plane_provisioning_steps_status_check check (
    status in ('pending', 'ready', 'blocked', 'running', 'completed', 'failed', 'skipped', 'rolled_back')
  )
);

comment on table public.control_plane_provisioning_steps is
  'ProvisioningStepState persistido por run (migration 0098). unique(run_id, step_id) é a idempotência: reprocessar o mesmo passo faz upsert, nunca duplica linha.';

create unique index if not exists control_plane_provisioning_steps_run_step_uniq
  on public.control_plane_provisioning_steps (run_id, step_id);
create index if not exists control_plane_provisioning_steps_run_status_idx
  on public.control_plane_provisioning_steps (run_id, status);

alter table public.control_plane_provisioning_steps enable row level security;
revoke all on public.control_plane_provisioning_steps from anon;

drop policy if exists platform_admin_only_control_plane_provisioning_steps on public.control_plane_provisioning_steps;
create policy platform_admin_only_control_plane_provisioning_steps on public.control_plane_provisioning_steps
  for all
  using (public.fn_is_platform_admin())
  with check (public.fn_is_platform_admin());

drop trigger if exists trg_control_plane_provisioning_steps_updated_at on public.control_plane_provisioning_steps;
create trigger trg_control_plane_provisioning_steps_updated_at
  before update on public.control_plane_provisioning_steps
  for each row execute function public.fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- control_plane_secret_references — o Credentials Vault. Antes de
-- control_plane_provider_connections de propósito: esta é referenciada por
-- aquela via FK.
-- ---------------------------------------------------------------------------
create table if not exists public.control_plane_secret_references (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid references public.control_plane_installations(id) on delete set null,
  tenant_id uuid references public.control_plane_tenants(id) on delete set null,
  reference text not null,
  type text not null,
  provider text not null,
  vault_provider text not null,
  vault_key text not null,
  version integer not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz,
  constraint control_plane_secret_references_type_check check (
    type in ('api_key', 'oauth_token', 'database_password', 'ssh_key', 'webhook_secret', 'service_account', 'tls_certificate', 'other')
  ),
  constraint control_plane_secret_references_provider_check check (
    provider in (
      'noop', 'fake', 'supabase', 'vercel', 'dns', 'vps', 'docker', 'reverse_proxy',
      'redis', 'email', 'whatsapp', 'chatwoot', 'evolution', 'waha', 'platform'
    )
  ),
  constraint control_plane_secret_references_vault_provider_check check (
    vault_provider in ('noop', 'in_memory', 'database_placeholder')
  ),
  constraint control_plane_secret_references_status_check check (status in ('pending', 'active', 'rotated', 'revoked'))
);

comment on table public.control_plane_secret_references is
  'Credentials Vault (migration 0098) — só REFERÊNCIA de segredo, nunca o valor. Colunas propositalmente restritas: reference/type/provider/vault_provider/vault_key/version/status/datas. NUNCA adicionar coluna de token/senha/api_key/service_role/private_key/ssh_key/connection_string aqui — ver docs/control-plane-persistence/credentials-vault.md.';
comment on column public.control_plane_secret_references.vault_key is
  'Ponteiro OPACO pro backend do vault (ex.: caminho/ARN de um vault real futuro) — nunca o segredo em si nem material suficiente pra reconstruí-lo. Nesta fase, sempre um placeholder (vault_provider in noop/in_memory/database_placeholder).';

create unique index if not exists control_plane_secret_references_reference_uniq on public.control_plane_secret_references (reference);
create index if not exists control_plane_secret_references_installation_id_idx on public.control_plane_secret_references (installation_id);
create index if not exists control_plane_secret_references_provider_idx on public.control_plane_secret_references (provider);
create index if not exists control_plane_secret_references_status_idx on public.control_plane_secret_references (status);

alter table public.control_plane_secret_references enable row level security;
revoke all on public.control_plane_secret_references from anon;

drop policy if exists platform_admin_only_control_plane_secret_references on public.control_plane_secret_references;
create policy platform_admin_only_control_plane_secret_references on public.control_plane_secret_references
  for all
  using (public.fn_is_platform_admin())
  with check (public.fn_is_platform_admin());

drop trigger if exists trg_control_plane_secret_references_updated_at on public.control_plane_secret_references;
create trigger trg_control_plane_secret_references_updated_at
  before update on public.control_plane_secret_references
  for each row execute function public.fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- control_plane_provider_connections
-- ---------------------------------------------------------------------------
create table if not exists public.control_plane_provider_connections (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.control_plane_installations(id) on delete cascade,
  provider text not null,
  mode text not null,
  status text not null,
  config jsonb not null default '{}',
  secret_reference_id uuid references public.control_plane_secret_references(id) on delete set null,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint control_plane_provider_connections_provider_check check (
    provider in (
      'noop', 'fake', 'supabase', 'vercel', 'dns', 'vps', 'docker', 'reverse_proxy',
      'redis', 'email', 'whatsapp', 'chatwoot', 'evolution', 'waha'
    )
  ),
  constraint control_plane_provider_connections_mode_check check (mode in ('dry_run', 'simulation', 'real')),
  constraint control_plane_provider_connections_status_check check (
    status in ('available', 'unavailable', 'planned', 'disabled')
  ),
  constraint control_plane_provider_connections_installation_provider_uniq unique (installation_id, provider)
);

comment on table public.control_plane_provider_connections is
  'Registro de configuração SANITIZADA + ponteiro de secret pra um provider (migration 0098) — nunca conecta nada de verdade nesta fase (mode sempre dry_run/simulation; "real" é literal reservado, mesma doutrina de lib/provisioning-adapters/types.ts). config já passou por assertSafePersistencePayload.';

create index if not exists control_plane_provider_connections_installation_id_idx
  on public.control_plane_provider_connections (installation_id);
create index if not exists control_plane_provider_connections_provider_idx
  on public.control_plane_provider_connections (provider);

alter table public.control_plane_provider_connections enable row level security;
revoke all on public.control_plane_provider_connections from anon;

drop policy if exists platform_admin_only_control_plane_provider_connections on public.control_plane_provider_connections;
create policy platform_admin_only_control_plane_provider_connections on public.control_plane_provider_connections
  for all
  using (public.fn_is_platform_admin())
  with check (public.fn_is_platform_admin());

drop trigger if exists trg_control_plane_provider_connections_updated_at on public.control_plane_provider_connections;
create trigger trg_control_plane_provider_connections_updated_at
  before update on public.control_plane_provider_connections
  for each row execute function public.fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- control_plane_operation_events — trilha append-only (mesma doutrina de
-- api_audit_log: sem policy de UPDATE/DELETE, só SELECT/INSERT).
-- ---------------------------------------------------------------------------
create table if not exists public.control_plane_operation_events (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid references public.control_plane_installations(id) on delete set null,
  tenant_id uuid references public.control_plane_tenants(id) on delete set null,
  provisioning_run_id uuid references public.control_plane_provisioning_runs(id) on delete set null,
  event_type text not null,
  severity text not null,
  message text not null,
  metadata jsonb not null default '{}',
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint control_plane_operation_events_severity_check check (severity in ('info', 'warning', 'error', 'success'))
);

comment on table public.control_plane_operation_events is
  'Trilha append-only "o que aconteceu com esta instalação" (migration 0098) — complementa api_audit_log ("quem fez"), nunca substitui: mesmo padrão de BillingEvent/ProvisioningLogEntry já existentes noutras Foundations. metadata já passou por assertSafePersistencePayload, nunca segredo.';
comment on column public.control_plane_operation_events.event_type is
  'Vocabulário ABERTO — deliberadamente SEM CHECK (mesma doutrina de crm_lead_activities.type): runtimes futuros somam evento novo sem exigir migration. Vocabulário de referência em CONTROL_PLANE_OPERATION_EVENT_TYPES (lib/control-plane-persistence/types.ts) — fora do invariante vocabulario-banco-x-typescript.test.ts, que só cobre coluna com CHECK.';

create index if not exists control_plane_operation_events_installation_occurred_idx
  on public.control_plane_operation_events (installation_id, occurred_at desc);
create index if not exists control_plane_operation_events_tenant_occurred_idx
  on public.control_plane_operation_events (tenant_id, occurred_at desc);
create index if not exists control_plane_operation_events_event_type_idx
  on public.control_plane_operation_events (event_type);

alter table public.control_plane_operation_events enable row level security;
revoke all on public.control_plane_operation_events from anon;

drop policy if exists control_plane_operation_events_select on public.control_plane_operation_events;
create policy control_plane_operation_events_select on public.control_plane_operation_events
  for select
  using (public.fn_is_platform_admin());

drop policy if exists control_plane_operation_events_insert on public.control_plane_operation_events;
create policy control_plane_operation_events_insert on public.control_plane_operation_events
  for insert
  with check (public.fn_is_platform_admin());
-- Sem policy de UPDATE/DELETE — RLS ligada nega os dois por padrão. Append-only.
