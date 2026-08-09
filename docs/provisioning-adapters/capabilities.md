---
type: reference
status: v1 — fundação
last_updated: 2026-08-09
---

# Catálogo de capabilities

`lib/provisioning-adapters/capabilities.ts` declara `PROVISIONING_ADAPTER_CAPABILITY_CATALOG`
— metadado puro, nenhuma capability executa nada. `id` é sempre
`${provider}.${operation}`.

| Provider | Operações | Planos |
|---|---|---|
| `noop` | `simulate` | lite, pro, dedicated |
| `fake` | `simulate` | lite, pro, dedicated |
| `supabase` | `project.create`, `auth.configure`, `auth.link`, `database.prepare`, `database.policies`, `storage.configure`, `edge_functions.prepare` | lite, pro, dedicated |
| `vercel` | `project.create`, `env.configure`, `deployment.prepare`, `domain.attach` | lite, pro |
| `dns` | `record.plan`, `domain.validate`, `cname.plan`, `txt.plan` | dedicated |
| `vps` | `server.validate`, `filesystem.prepare`, `service.plan` | dedicated |
| `docker` | `compose.validate`, `container.plan`, `network.plan`, `volume.plan` | dedicated |
| `reverse_proxy` | `route.plan`, `tls.plan` | dedicated |
| `redis` | `instance.plan`, `connection.validate` | dedicated |
| `email` | `provider.configure`, `sender.verify` | lite, pro, dedicated |
| `whatsapp` | `channel.plan`, `inbox.plan` | lite, pro, dedicated |
| `chatwoot` | `account.plan`, `inbox.plan` | lite, pro, dedicated |
| `evolution` | `instance.plan`, `webhook.plan` | lite, pro, dedicated |
| `waha` | `session.plan` | lite, pro, dedicated |

`supportedPlans` reflete onde a etapa correspondente do Provisioning Engine
(`lib/provisioning/catalog.ts`) de fato aparece — nunca inventado
independente do catálogo de etapas real.

## Mapeamento etapa → provider (`catalog.ts::STEP_ADAPTER_MAP`)

Das 31 etapas de `PROVISIONING_STEP_CATALOG`:

- **17 mapeadas estaticamente** — ex.: `create_supabase_project` →
  `supabase.project.create`, `configure_redis` → `redis.instance.plan`.
- **2 condicionadas ao `target`** — `configure_domain`/`configure_ssl`:
  `target === "vps"` usa `dns`/`reverse_proxy`; `target` Vercel/Cloudflare
  usa `vercel.domain.attach` (SSL emitido automaticamente pela plataforma,
  sem adapter dedicado nesse caso).
- **12 sem provider nesta fundação** — `validate_tenant`,
  `validate_manifest`, `validate_modules`, `resolve_branding`,
  `prepare_environment_template`, `configure_application`,
  `configure_auth`, `configure_monitoring`, `configure_ai_provider`,
  `create_owner`, `run_healthcheck`, `finalize_handoff`. Não há provider
  "monitoring" nem "ai" na lista de 14 — isso é reportado honestamente pelo
  mapper como `status: "unmapped"`, nunca um blocker.

## Chatwoot / Evolution / WAHA sem etapa própria

O catálogo do Provisioning Engine só tem `configure_whatsapp` (genérico,
mapeado pro provider `whatsapp`). Chatwoot/Evolution/WAHA são blueprints
registrados na `ProvisioningAdapterRegistry` mas alcançáveis só direto
(`registry.findAdapter(provider)`) — nunca forçados a um `stepId` que não
existe no catálogo real. Os cenários `chatwoot-ready`/`evolution-ready`/
`waha-ready` de `simulation.ts` demonstram isso construindo o request
diretamente.

## Limitações documentadas

- `configure_auth` fica sem adapter — ambíguo entre Supabase/Vercel/VPS
  dependendo do `target`; decisão deliberada de não forçar mapeamento.
- `configure_ssl` sem adapter em `target` Vercel/Cloudflare — SSL automático
  do host.
