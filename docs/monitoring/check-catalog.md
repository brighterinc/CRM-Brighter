---
type: reference
status: v1 — fundação
last_updated: 2026-08-03
---

# Catálogo de checks do Monitoring Engine

> Ver [`monitoring-engine.md`](monitoring-engine.md) pra visão geral da
> fundação. Fonte canônica: `lib/monitoring/catalog.ts::MONITORING_CHECK_CATALOG`
> (37 entradas) — esta tabela é gerada a partir dela; se divergir, o código
> manda.

Nenhum destes checks executa rede, DNS, SSL, Supabase, Vercel, VPS, Docker,
Redis, WAHA, Chatwoot ou Evolution de verdade nesta Foundation v1 — todos
os resultados vêm de um `MonitoringAdapter` fake/noop ou de
`simulateMonitoringRun`.

| Id | Categoria | Planos | Módulos exigidos | Infra exigida | Severidade | Cadência | Padrão |
|---|---|---|---|---|---|---|---|
| `application_reachable` | application | lite, pro, dedicated | — | — | critical | hourly | sim |
| `application_health_endpoint` | application | lite, pro, dedicated | — | — | critical | hourly | sim |
| `domain_configured` | domain | lite, pro, dedicated | — | — | warning | manual | sim |
| `dns_resolves` | dns | lite, pro, dedicated | — | — | critical | daily | sim |
| `ssl_valid` | ssl | lite, pro, dedicated | — | — | critical | daily | sim |
| `ssl_expiration` | ssl | lite, pro, dedicated | — | — | warning | daily | sim |
| `authentication_available` | authentication | lite, pro, dedicated | — | — | critical | hourly | sim |
| `database_reachable` | database | lite, pro, dedicated | — | — | critical | hourly | sim |
| `storage_available` | storage | lite, pro, dedicated | — | — | warning | daily | sim |
| `owner_access_configured` | authentication | lite, pro, dedicated | — | — | warning | manual | sim |
| `module_configuration_consistent` | monitoring | lite, pro, dedicated | — | — | warning | daily | sim |
| `deployment_manifest_consistent` | monitoring | lite, pro, dedicated | — | — | warning | manual | sim |
| `provisioning_completed` | monitoring | lite, pro, dedicated | — | — | critical | manual | sim |
| `backup_recent` | backup | lite, pro, dedicated | — | — | warning | daily | sim |
| `monitoring_configured` | monitoring | lite, pro, dedicated | — | — | info | manual | sim |
| `frontend_deployment_available` | application | lite, pro | — | — | critical | hourly | sim |
| `supabase_project_configured` | database | lite, pro | — | — | critical | manual | sim |
| `supabase_auth_available` | authentication | lite, pro | — | — | critical | hourly | sim |
| `supabase_database_available` | database | lite, pro | — | — | critical | hourly | sim |
| `supabase_storage_available` | storage | lite, pro | — | — | warning | daily | sim |
| `managed_cron_configured` | scheduler | lite, pro | — | scheduler | warning | manual | sim |
| `edge_functions_available` | integration | lite, pro | — | edgeFunctions | info | daily | sim |
| `vps_reachable` | application | dedicated | — | — | critical | hourly | sim |
| `runtime_available` | application | dedicated | — | — | critical | hourly | sim |
| `reverse_proxy_available` | application | dedicated | — | — | critical | hourly | sim |
| `redis_available` | redis | dedicated | — | redis | critical | hourly | sim |
| `worker_running` | worker | dedicated | — | worker | critical | hourly | sim |
| `scheduler_running` | scheduler | dedicated | — | scheduler | warning | hourly | sim |
| `backup_job_configured` | backup | dedicated | — | — | warning | manual | sim |
| `disk_capacity` | application | dedicated | — | — | warning | daily | sim |
| `memory_capacity` | application | dedicated | — | — | warning | daily | sim |
| `service_restart_policy` | application | dedicated | — | — | info | manual | sim |
| `email_provider_configured` | email | lite, pro, dedicated | `channel.email` | — | warning | manual | sim |
| `whatsapp_channel_configured` | whatsapp | dedicated | `channel.whatsapp` | — | critical | hourly | sim |
| `waha_available` | waha | dedicated | `channel.whatsapp` | — | critical | hourly | sim |
| `chatwoot_available` | chatwoot | dedicated | `channel.chatwoot` | — | warning | hourly | **não** |
| `evolution_available` | evolution | dedicated | `channel.evolution` | — | warning | hourly | **não** |

## Sobre `chatwoot_available`/`evolution_available`

Estes dois checks referenciam ids de módulo (`channel.chatwoot`,
`channel.evolution`) que **não existem** em
`lib/modules/catalog.ts::MODULE_CATALOG`. Eles ficam no catálogo — a
doutrina desta Foundation pede as duas entradas — mas com
`enabledByDefault: false` e, por construção de
`resolveApplicableMonitoringChecks` (que sempre filtra
`requiredModules.every(id => installation.modules.includes(id))`), nenhuma
instalação jamais os terá como aplicáveis nesta versão. Quando o Module
Engine ganhar os módulos Chatwoot/Evolution de verdade, basta os IDs
passarem a existir em `MODULE_CATALOG` e ligar `enabledByDefault: true`
aqui — nenhuma outra mudança é necessária.

## `requiredModules` vs. `requiresInfra`

- **`requiredModules`** — lista de ids de `MODULE_CATALOG`; o check só se
  aplica se **todos** estiverem em `installation.modules` (= `tenant.enabledModules`).
  Usado pros checks de canal (`email_provider_configured`,
  `whatsapp_channel_configured`, `waha_available`, e os dois inertes acima).
- **`requiresInfra`** — lista de flags de `ModuleInfraRequirements`
  (`lib/modules/catalog.ts`); o check só se aplica se
  `installation.deployment.infrastructure[flag]` for `true` — mesma
  convenção de `ProvisioningStepDefinition.requiresInfra`
  (`lib/provisioning/types.ts`). Usado pros checks de infraestrutura
  condicional (`managed_cron_configured`, `edge_functions_available`,
  `redis_available`, `worker_running`, `scheduler_running`) — é assim que
  Redis/worker/scheduler nunca são exigidos no Lite (cujo manifesto nunca
  liga essas flags a menos que algum módulo habilitado exija).
