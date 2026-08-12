---
type: architecture
status: v1
last_updated: 2026-08-12
---

# Schema — Control Plane Persistence

> Migration `supabase/migrations/20260811000000_0098_control_plane_persistence.sql`
> (NNNN=0098). Ver `migration.md` pro processo de aplicação/rollback.

## Por que nenhuma tabela tem `organization_id`

`organization_id` é doutrina pra dado de TENANT da CRM (`contacts`,
`crm_leads`, `conversations` — RLS por `fn_user_org_ids()`). Control Plane é
o inverso: a Brighter observando de FORA todas as instalações White Label.
`control_plane_tenants` aqui é o CLIENTE da Brighter, não uma linha de
`organizations` desta CRM. Mesma classe de tabela que `incidents` (migration
0021) e `system_version`/`system_update_runs` (migration 0089) —
instância/plataforma, não inquilino.

## Tabelas

### `control_plane_tenants`

Espelha `lib/tenants/types.ts::Tenant`, **exceto `.manifest`** — nunca é
coluna (ver "Campos deliberadamente ausentes" abaixo). Colunas: `client_slug`
(unique, formato validado), `client_name`, `legal_name`, `domain`, `plan`
(check `lite|pro|dedicated`), `requested_modules`/`enabled_modules` (`text[]`),
`branding`/`primary_contact`/`account_manager`/`infrastructure`/`supabase_ref`
(`jsonb`, sempre dado público — nunca segredo), `commercial_status` (check, 7
valores), `technical_status` (check, 8 valores), `notes`, `created_at`/`updated_at`.

### `control_plane_installations`

`tenant_id → control_plane_tenants (cascade)`. `slug` (unique), `company`,
`status` (check, 11 valores `InstallationStatus`), `commercial`/`technical`
(checks — vocabulário PRÓPRIO da Installation, **distinto** do
`commercial_status`/`technical_status` do tenant: mesmos nomes de coluna,
listas diferentes por desenho, ver `lib/control-plane/types.ts`).

**Campos deliberadamente ausentes**: `deployment`, `branding`, `modules`,
`deploymentPlan`, `provisioning`. Sempre derivados do `tenant` em runtime via
`deriveInstallationFromTenant` (`lib/control-plane/repository.ts`, exportada
nesta fase por este motivo) — persistir como coluna duplicaria uma fonte de
verdade que já existe no tenant (CLAUDE.md anti-padrão nº2).

### `control_plane_deployments`

Histórico versionado do `DeploymentManifest` gerado — espelho, **nunca
autoritativo** (mesmo espírito de `meta_templates`). `installation_id`/
`tenant_id` (`on delete cascade`), `target` (check), `plan` (check),
`manifest_fingerprint`, `manifest_snapshot` (`jsonb`, já sanitizado),
`generated_at`.

### `control_plane_provisioning_runs` / `control_plane_provisioning_steps`

Espelha `lib/provisioning/types.ts::ProvisioningPlan`/`ProvisioningStepState`,
mas NORMALIZADO (1 run → N steps, em vez de array embutido). `steps.run_id →
runs (cascade)`; `unique (run_id, step_id)` é a idempotência — reprocessar o
mesmo passo faz upsert, nunca duplica linha.

### `control_plane_provider_connections`

Config **sanitizada** (nunca credencial) + ponteiro opcional pra
`control_plane_secret_references`. `unique (installation_id, provider)`.
`mode` é sempre `dry_run`/`simulation` — `"real"` reservado, nunca usado
nesta fase.

### `control_plane_secret_references` — o Credentials Vault

Só `reference`/`type`/`provider`/`vault_provider`/`vault_key`/`version`/
`status`/datas. **Nunca** token, senha, API key, service_role, chave privada,
SSH key, connection string, cookie, session. Ver `credentials-vault.md`.

### `control_plane_operation_events`

Append-only (RLS só SELECT+INSERT, sem UPDATE/DELETE — mesma doutrina de
`api_audit_log`). `event_type` é **vocabulário aberto, sem CHECK**
(mesma doutrina de `crm_lead_activities.type`) — runtimes futuros somam
tipo de evento novo sem exigir migration. Vocabulário de referência:
`CONTROL_PLANE_OPERATION_EVENT_TYPES` (`lib/control-plane-persistence/types.ts`).

## FKs: CASCADE vs SET NULL

| Tabela | Comportamento | Por quê |
|---|---|---|
| `installations`, `deployments`, `provisioning_runs`, `provisioning_steps`, `provider_connections` | `CASCADE` com o pai | "Estado atual" — sem o pai não significam nada |
| `secret_references`, `operation_events` | `SET NULL` | "Trilha/histórico" — apagar uma instalação não pode apagar em silêncio o ponteiro de um segredo que ainda existe no vault real, nem o rastro de auditoria (CLAUDE.md anti-padrão nº7, "cascade fantasma") |

## Vocabulário: CHECK fechado vs aberto

Toda coluna com CHECK espelha um union TypeScript fechado, emitido por UM
lugar só no código (mesma doutrina de `meta_templates.parameter_format`).
Exceção deliberada: `control_plane_operation_events.event_type` (ver acima)
— fora do invariante `tests/invariants/vocabulario-banco-x-typescript.test.ts`,
que só cobre coluna que JÁ tem CHECK.
