---
type: architecture
status: v1 — fundação
last_updated: 2026-08-12
---

# Brighter Platform

> Visão de conjunto das fundações que transformam o DeskcommCRM na base técnica
> comercializada como White Label pela Brighter. Cada fundação é um épico
> próprio, documentado no seu próprio doc — este arquivo é o mapa entre elas,
> não um substituto.

## As fundações

```
┌─────────────────────────────────────────────────────────────────┐
│  White Label Runtime          (concluído)                       │
│  branding por ambiente: nome, logo, favicon, suporte, remetente,│
│  razão social — sem rebuild. lib/branding.ts.                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓ consome
┌─────────────────────────────────────────────────────────────────┐
│  Module Engine                (concluído — v1)                  │
│  catálogo tipado de módulos, planos Lite/Pro/Dedicated,          │
│  dependências, requisitos de infra, proteção de rota,            │
│  sidebar modular. lib/modules/.                                  │
│  Ver docs/modules/module-engine.md.                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓ resolvido por
┌─────────────────────────────────────────────────────────────────┐
│  Deployment Engine             (concluído — Foundation v1)      │
│  transforma configuração comercial de cliente (plano, módulos,   │
│  branding, domínio) em manifesto técnico validado: infra         │
│  exigida, variáveis de ambiente (só nomes), blockers/warnings,   │
│  checklist. NÃO provisiona nada. lib/deployment/.                │
│  Ver docs/deployment/deployment-engine.md.                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓ consolidado por
┌─────────────────────────────────────────────────────────────────┐
│  Tenant Engine                 (concluído — Foundation v1)      │
│  consolida identidade comercial, plano, módulos, branding,       │
│  status comercial/técnico, responsáveis e referências de infra/  │
│  Supabase de um cliente White Label num `Tenant` só, com motor   │
│  de prontidão (score 0–100) e export seguro. SEM persistência    │
│  real (in-memory de demo/teste) e SEM provisionar nada.          │
│  lib/tenants/. Ver docs/tenants/tenant-engine.md.                │
└─────────────────────────────────────────────────────────────────┘
                              ↓ ordenado por
┌─────────────────────────────────────────────────────────────────┐
│  Provisioning Engine            (concluído — Foundation v1)     │
│  transforma um `Tenant` + seu `DeploymentManifest` num plano de  │
│  execução ORDENADO: etapas, dependências, status, blockers,      │
│  dry-run, rollback teórico e logs sanitizados. Mesma doutrina    │
│  das fundações anteriores — camada de domínio pura, SEM          │
│  persistência real (plano recalculado em memória a cada          │
│  chamada) e SEM adaptador real de infra (só fake/noop). A        │
│  persistência real de runs/steps já existe — ver Control Plane   │
│  Persistence + Credentials Vault, abaixo. lib/provisioning/.     │
│  Ver docs/provisioning/provisioning-engine.md.                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓ agregado por
┌─────────────────────────────────────────────────────────────────┐
│  Control Plane                  (concluído — Foundation v1)     │
│  agrega TODAS as instalações White Label da Brighter num único   │
│  tipo (`Installation` = `Tenant` + `DeploymentManifest` +        │
│  `ProvisioningSummary` + branding + módulos), com vocabulário     │
│  PRÓPRIO de status (`InstallationStatus`/`CommercialStatus`/      │
│  `TechnicalStatus` — a visão da BRIGHTER sobre a instalação,      │
│  distinta do `commercialStatus`/`technicalStatus` que o próprio  │
│  `Tenant` já rastreia sobre si mesmo). Catálogo de metadados de   │
│  status, validação que impede `deployment`/`branding`/`modules`  │
│  divergirem do `tenant` embutido, repositório in-memory,          │
│  filtros compostos e resumo agregado (dashboard). Mesma doutrina │
│  de camada de domínio pura — SEM persistência real (só            │
│  `InMemoryInstallationRepository`, demonstração), SEM API, SEM    │
│  Docker/VPS/Supabase/DNS reais. lib/control-plane/. Ver           │
│  docs/control-plane/control-plane.md.                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓ observado por
┌─────────────────────────────────────────────────────────────────┐
│  Monitoring Engine               (concluído — Foundation v1)    │
│  representa, calcula e resume a saúde operacional de cada        │
│  instalação a partir do agregado `Installation` da Control       │
│  Plane. Catálogo de ~37 checks (aplicação, DNS, SSL, banco,      │
│  auth, storage, Redis, worker, scheduler, e-mail, WhatsApp/WAHA,  │
│  backup), filtrados por plano + módulos + infraestrutura do      │
│  manifesto. Motor de avaliação determinístico (saúde geral,      │
│  score 0–100, blockers/warnings, checks ausentes/atrasados),      │
│  incidentes derivados com deduplicação, adaptadores fake/noop e   │
│  simulação determinística. SEM check real (rede/DNS/SSL/          │
│  Supabase/VPS/Docker/Redis/WAHA), SEM persistência real, SEM      │
│  API, SEM cron/worker reais. lib/monitoring/. Ver                │
│  docs/monitoring/monitoring-engine.md.                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓ licenciado/cobrado por
┌─────────────────────────────────────────────────────────────────┐
│  Billing Engine                 (concluído — Foundation v1)     │
│  domínio comercial/financeiro de cada instalação: plano          │
│  comercial (Lite/Pro/Dedicated, preços placeholder), assinatura,  │
│  ciclo, invoice em centavos, descontos/créditos, entitlement de   │
│  módulo (nunca concede o que o Module Engine já negou),           │
│  consumo vs. limites (só recomenda, nunca bloqueia), grace        │
│  period, upgrade imediato/downgrade agendado, cancelamento,       │
│  eventos, simulação de 22 cenários. SEM gateway (InfinitePay/     │
│  Stripe/Mercado Pago), SEM cobrança real, SEM persistência real,  │
│  SEM API. lib/billing/. Ver docs/billing/billing-engine.md.       │
└─────────────────────────────────────────────────────────────────┘
                              ↓ automatizado por
┌─────────────────────────────────────────────────────────────────┐
│  Automation Engine               (concluído — Foundation v1)    │
│  modela "o que uma instalação White Label PODE automatizar":     │
│  gatilhos, condições, ações, ramificação (branch), delay, retry, │
│  idempotência e histórico — domínio puro de simulação            │
│  determinística. Catálogo de 8 gatilhos + 5 ações (mesmos ids do │
│  motor legado, nunca importados). Executor abstrato só com        │
│  adaptadores fake/noop (`NoopWorkflowActionAdapter`,              │
│  `InMemoryWorkflowActionAdapter`) — nenhuma ação real executa.    │
│  Distinto do motor legado `lib/automation/` (execução real,       │
│  por-organização, `automation_rules`/`event_log` reais) — zero    │
│  acoplamento nas duas direções. SEM execução real, SEM             │
│  agendamento real (delay/retry só calculam `nextAttemptAt`), SEM  │
│  persistência real, SEM API. lib/automation-engine/. Ver          │
│  docs/automation/automation-engine.md.                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓ especializado por
┌─────────────────────────────────────────────────────────────────┐
│  Outreach & AI Cadence Engine    (concluído — Foundation v1)     │
│  domínio COMERCIAL de outreach/cadência: campanhas, segmentos,   │
│  audiência, cadência multi-etapa, janela/throttling (valores     │
│  reais do anti-ban), templates+personalização, consentimento/    │
│  opt-out (espelha `contacts.is_blocked`/`consent`), respostas +  │
│  classificação por IA opcional (`ai.agents`, fake/noop), handoff │
│  humano (preview) e métricas — domínio puro de simulação         │
│  determinística. TODA campanha exige `automation.campaigns`      │
│  (status: planned) — nunca autorizada em produção nesta          │
│  Foundation. Integra (sem duplicar) Billing/Monitoring/Control   │
│  Plane e um view model pro Automation Engine (nunca um           │
│  `WorkflowDefinition` real). SEM envio real, SEM IA real, SEM    │
│  agendamento real, SEM persistência real, SEM API.               │
│  lib/outreach/. Ver docs/outreach/outreach-engine.md.            │
└─────────────────────────────────────────────────────────────────┘
                              ↓ ofertado/licenciado por
┌─────────────────────────────────────────────────────────────────┐
│  Marketplace / Module Licensing Engine (concluído — Foundation v1)│
│  catálogo COMERCIAL de módulos (distinto do MODULE_CATALOG        │
│  técnico, sempre derivado dele), ofertas, bundles, licenças        │
│  (`ModuleLicense`, 5º eixo de status — `LicenseStatus`), trials    │
│  (nunca passam por Billing), elegibilidade prospectiva             │
│  (`evaluateModuleEligibility`) x entitlement de estado atual        │
│  (`resolveMarketplaceEntitlements` — nunca concede além do Module  │
│  Engine nem do Billing), plano de ativação teórico (nunca ativa    │
│  módulo/edita `.env`/faz deploy) e versionamento SemVer — domínio  │
│  puro de simulação determinística (26 cenários). Integra (sem      │
│  duplicar) Module Engine/Billing/Monitoring/Provisioning/Control   │
│  Plane via view models. SEM ativação real, SEM cobrança real, SEM  │
│  provisionamento real, SEM persistência real, SEM API.             │
│  lib/marketplace/. Ver docs/marketplace/marketplace-engine.md.     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ traduzido pra provider por
┌─────────────────────────────────────────────────────────────────┐
│  Provisioning Adapters Engine    (concluído — Foundation v1)     │
│  traduz etapa ABSTRATA do Provisioning Engine pra provider        │
│  CONCRETO (Supabase/Vercel/DNS/VPS/Docker/Reverse Proxy/Redis/    │
│  Email/WhatsApp/Chatwoot/Evolution/WAHA/Noop/Fake) — só contrato  │
│  tipado, blueprint, simulador determinístico. Catálogo de         │
│  capabilities por provider, mapeamento etapa→provider/operação    │
│  (17 estáticas, 2 condicionadas ao `target`, 12 sem provider      │
│  nesta Foundation), registry sem singleton mutável, executor de   │
│  dry-run que respeita ordem/dependências/blockers (propaga        │
│  bloqueio em cascata), rollback preview por provider, 22 cenários │
│  de simulação. `mode: "real"` é tipo reservado — `executeReal()`  │
│  sempre lança `RealProvisioningDisabledError`. Integra (sem        │
│  duplicar) Provisioning Engine/Marketplace/Control Plane. SEM      │
│  provider real executado, SEM API externa chamada, SEM Docker      │
│  executado, SEM persistência real, SEM API.                        │
│  lib/provisioning-adapters/. Ver                                   │
│  docs/provisioning-adapters/overview.md.                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓ persistido por
┌─────────────────────────────────────────────────────────────────┐
│  Control Plane Persistence + Credentials Vault  (concluído — v1) │
│  PRIMEIRO consumidor real de persistência de `Tenant`/            │
│  `Installation`/`DeploymentManifest` (histórico)/`ProvisioningPlan`│
│  — 8 tabelas `control_plane_*` (migration 0098), banco PRÓPRIO da │
│  Brighter, nunca dentro do banco de um cliente. RLS restrita a    │
│  `fn_is_platform_admin()` em todas (nenhuma tem `organization_id` │
│  — plataforma, não tenant da CRM). Credentials Vault (referência  │
│  de segredo, NUNCA o valor — `createReference`/                   │
│  `resolveReferenceMetadata`/`rotateReference`/`revokeReference`/  │
│  `validateReference`, sem `getSecretValue()`), `Database*Repository`│
│  ao lado dos `InMemory*` já existentes (troca explícita via        │
│  factory), mappers domain↔row, `assertSafePersistencePayload`      │
│  fail-closed, camada de serviço com audit log + operation events.  │
│  AINDA NÃO conecta nenhum provider real — `mode` de                │
│  `control_plane_provider_connections` continua `dry_run`/          │
│  `simulation`. lib/control-plane-persistence/. Ver                 │
│  docs/control-plane-persistence/overview.md.                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (futuro)
┌─────────────────────────────────────────────────────────────────┐
│  Provider Credentials Runtime + Real Adapters            (futuro) │
│  Implementações REAIS de `ProvisioningProviderAdapter`            │
│  (Supabase/Vercel/VPS/DNS/Caddy/Docker/Redis/WhatsApp-WAHA-       │
│  Evolution-Chatwoot/e-mail) plugadas no registry já existente em   │
│  `lib/provisioning-adapters/` sem mudar sua interface, um          │
│  `vaultProvider` real (ex.: Postgres `pgp_sym_encrypt`, mesmo       │
│  padrão do OAuth do Nuvemshop) por trás do Credentials Vault já    │
│  persistido acima, persistência real de `MonitoringSnapshot`/      │
│  `MonitoringIncident`/`BillingSubscription`/`BillingInvoice`, e de  │
│  pagamento (InfinitePay/Stripe/Mercado Pago) que de fato            │
│  executam o `ProvisioningPlan`/os checks de monitoramento/a         │
│  cobrança. Por doutrina, CONSOME as camadas de domínio já           │
│  existentes (tipos, validação, readiness, planner, executor,        │
│  evaluator, `InstallationRepository`/`MonitoringRepository`/         │
│  `BillingRepository`/`ProvisioningAdapterRepository`), nunca as      │
│  substitui. Ver ROADMAP.md.                                         │
└─────────────────────────────────────────────────────────────────┘
```

**Nota sobre IA:** IA não é uma engine própria nesta arquitetura — é uma
capacidade opcional consumida pelos módulos `ai.agents`/`ai.memory`/
`ai.rag` (`lib/modules/catalog.ts`) e por módulos específicos como o
Outreach & AI Cadence Engine (classificação de resposta, rascunho,
handoff), atendimento e comercial. Removida do roadmap como fundação
estrutural independente (ver ROADMAP.md).

Cada camada consome a anterior sem duplicar a sua regra: o Deployment Engine
reusa o catálogo e o resolvedor do Module Engine em vez de redecidir "que
módulo existe em que plano"; o Module Engine reusa `lib/branding.ts` pra
variáveis de marca. Ver `CLAUDE.md` §"Anti-patterns proibidos" item 2
("duplicação sem source of truth declarado").

## Doutrina de engine (Module/Deployment/Tenant e as futuras)

Cada fundação acima nasce como **camada de domínio pura**, nunca como CRUD/
API-first: tipos, validação, função de regra de negócio (pura,
determinística), repositório em memória (interface + implementação de
demo/teste) quando aplicável, e — quando faz sentido — uma leitura somente
do estado atual da própria instalação. **Sem persistência real, sem
migration, sem Edge Function, sem rota de API nova, sem integração com
Supabase**, até que a arquitetura peça explicitamente uma camada dona de
persistência (Provisioning Engine acima é o primeiro caso disso).

**Quando a persistência real chegar, ela CONSOME a camada de domínio já
existente — nunca a substitui.** Ex.: um futuro
`SupabaseTenantRepository` implementaria a MESMA interface
`TenantRepository` já definida em `lib/tenants/repository.ts`; os tipos, a
validação e o motor de prontidão (`evaluateTenantReadiness`) continuam
exatamente como estão.

Regra de composição, válida pro Tenant Engine e pras próximas fundações:
**cada entidade nova só REFERENCIA o que as fundações anteriores já
resolvem — nunca duplica.** No `Tenant` (`lib/tenants/types.ts`): módulos
são `string[]` de IDs (nunca a definição completa do módulo, que mora só no
Module Engine); `manifest` é o objeto literal que
`generateDeploymentManifest()` produziu (nunca regerado/reimplementado);
`branding` reusa o mesmo tipo `ClientBrandingInput` do Deployment Engine
(nunca redefinido) porque é dado de ENTRADA inevitável — o White Label
Runtime não persiste marca como entidade endereçável por ID, então não há
o que referenciar além do valor em si.

## Os três planos comerciais

| Plano | Frontend | Banco/Auth | VPS | Canais | Uso típico |
|---|---|---|---|---|---|
| **Lite** | Vercel/Cloudflare (hospedado) | Supabase Auth + Postgres; Storage/Edge Functions opcionais | Não | Sem WhatsApp | Cliente só com CRM + IA, sem canal próprio |
| **Pro** | Vercel/Cloudflare (hospedado) | Idem Lite | Não (por padrão) | Sem WhatsApp | Idem Lite + automações leves, cron gerenciado, integrações gerenciadas |
| **Dedicated** | Servido pela própria VPS | Supabase (ou banco próprio) | **Sim, exclusiva** — Docker + Caddy/SSL | WhatsApp (WAHA), IA contínua | Operação completa — modelo usado hoje pela Brighter |

## Regras de instalação

- **Cada cliente = 1 `Tenant` = 1 `Deployment`.** Nunca suportar multi-tenant
  compartilhado no banco neste nível (cliente-da-Brighter) — o multi-tenant
  que o CLAUDE.md descreve ("arquitetura multi-tenant com RLS desde o dia
  1") é OUTRO nível, dentro de uma única instalação (`organizations`, ver
  `docs/tenants/tenant-lifecycle.md` §"As três coisas que NÃO são a mesma
  coisa"). Nunca confundir os dois.
- **Uma instalação, um banco, por cliente.** Cada cliente White Label tem seu
  próprio projeto Supabase (ou banco dedicado) — não há multi-tenant
  compartilhado entre clientes distintos da Brighter neste modelo (o
  multi-tenant do DeskcommCRM em si é dentro de uma instalação, para as
  organizações daquele cliente).
- **Lite/Pro:** frontend hospedado (Vercel ou Cloudflare) + Supabase próprio do
  cliente. Sem VPS.
- **Dedicated:** VPS exclusiva do cliente. Nunca compartilhada entre clientes,
  e nunca a mesma VPS de outra aplicação crítica não relacionada — ver seção
  abaixo.
- **Nenhuma dependência direta da Lumina.** A Lumina (`/opt/brighter-lumina`,
  porta 8000) é uma aplicação crítica de terceiros que pode coexistir na
  mesma VPS física em alguns ambientes operacionais, mas o DeskcommCRM (e o
  Deployment Engine, e o Tenant Engine) não lê, escreve, chama ou depende
  dela de forma alguma. Nenhuma peça deste sistema deve vir a acoplar nisso.

## Onde cada fundação mora no código

| Fundação | Código | Doc |
|---|---|---|
| White Label Runtime | `lib/branding.ts`, `app/public-env-script.tsx` | `docs/white-label.md` |
| Module Engine | `lib/modules/` | `docs/modules/module-engine.md` |
| Deployment Engine | `lib/deployment/`, `app/app/settings/deployment/`, `scripts/generate-deployment-manifest.ts` | `docs/deployment/deployment-engine.md` |
| Tenant Engine | `lib/tenants/`, `app/app/settings/operacao/`, `scripts/generate-tenant-summary.ts` | `docs/tenants/tenant-engine.md`, `docs/tenants/tenant-lifecycle.md` |
| Provisioning Engine | `lib/provisioning/`, `app/app/settings/provisionamento/`, `scripts/generate-provisioning-plan.ts` | `docs/provisioning/provisioning-engine.md`, `docs/provisioning/provisioning-lifecycle.md`, `docs/provisioning/rollback-strategy.md` |
| Control Plane | `lib/control-plane/`, `app/app/settings/control-plane/`, `scripts/control-plane-summary.ts` | `docs/control-plane/control-plane.md`, `docs/control-plane/lifecycle.md`, `docs/control-plane/status.md` |
| Monitoring Engine | `lib/monitoring/`, `app/app/settings/monitoramento/`, `scripts/generate-monitoring-summary.ts` | `docs/monitoring/monitoring-engine.md`, `docs/monitoring/monitoring-lifecycle.md`, `docs/monitoring/incidents.md`, `docs/monitoring/check-catalog.md` |
| Billing Engine | `lib/billing/`, `app/app/settings/billing/`, `scripts/generate-billing-summary.ts` | `docs/billing/billing-engine.md`, `docs/billing/subscription-lifecycle.md`, `docs/billing/invoices-and-payments.md`, `docs/billing/entitlements-and-limits.md`, `docs/billing/provider-adapters.md` |
| Automation Engine | `lib/automation-engine/`, `app/app/settings/automacao/`, `scripts/generate-automation-summary.ts` | `docs/automation/automation-engine.md`, `docs/automation/workflow-lifecycle.md`, `docs/automation/action-catalog.md` |
| Outreach & AI Cadence Engine | `lib/outreach/`, `app/app/settings/outreach/`, `scripts/generate-outreach-summary.ts` | `docs/outreach/outreach-engine.md`, `docs/outreach/campaign-lifecycle.md`, `docs/outreach/cadences.md`, `docs/outreach/audience-and-consent.md`, `docs/outreach/throttling-and-windows.md`, `docs/outreach/responses-and-ai.md`, `docs/outreach/human-handoff.md`, `docs/outreach/simulation.md` |
| Marketplace / Module Licensing Engine | `lib/marketplace/`, `app/app/settings/modulos-licencas/`, `scripts/generate-marketplace-summary.ts` | `docs/marketplace/marketplace-engine.md`, `docs/marketplace/module-catalog.md`, `docs/marketplace/offers-and-bundles.md`, `docs/marketplace/licenses.md`, `docs/marketplace/trials.md`, `docs/marketplace/entitlements.md`, `docs/marketplace/activation-plans.md`, `docs/marketplace/versioning.md`, `docs/marketplace/simulation.md` |
| Provisioning Adapters Engine | `lib/provisioning-adapters/`, `app/app/settings/provisioning-adapters/`, `scripts/generate-provisioning-adapters-summary.ts` | `docs/provisioning-adapters/overview.md`, `docs/provisioning-adapters/provider-contract.md`, `docs/provisioning-adapters/capabilities.md`, `docs/provisioning-adapters/dry-run.md`, `docs/provisioning-adapters/rollback.md`, `docs/provisioning-adapters/security.md`, `docs/provisioning-adapters/providers.md`, `docs/provisioning-adapters/simulation.md` |
| Control Plane Persistence + Credentials Vault | `lib/control-plane-persistence/`, `app/app/settings/control-plane/persistence/`, `scripts/control-plane-persistence-summary.ts`, `supabase/migrations/20260811000000_0098_control_plane_persistence.sql` | `docs/control-plane-persistence/overview.md`, `docs/control-plane-persistence/schema.md`, `docs/control-plane-persistence/security.md`, `docs/control-plane-persistence/credentials-vault.md`, `docs/control-plane-persistence/repositories.md`, `docs/control-plane-persistence/rls.md`, `docs/control-plane-persistence/migration.md`, `docs/control-plane-persistence/runtime-boundary.md` |
