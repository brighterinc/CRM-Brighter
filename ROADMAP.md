# Roadmap — Brighter Platform

> Roadmap das fundações que transformam o DeskcommCRM na base técnica
> comercializada como White Label pela Brighter. Ver
> [`docs/architecture/brighter-platform.md`](docs/architecture/brighter-platform.md)
> pro mapa completo entre elas.

## Concluído

- **White Label Runtime** — branding por ambiente (nome, logo, favicon,
  suporte, remetente, razão social), sem rebuild. `lib/branding.ts`. Ver
  `docs/white-label.md`.
- **Brighter Module Engine v1** — catálogo tipado de módulos, planos Lite/
  Pro/Dedicated, dependências, requisitos de infraestrutura, proteção de
  rotas, sidebar modular. `lib/modules/`. Ver
  `docs/modules/module-engine.md`.
- **Brighter Deployment Engine Foundation v1** — transforma configuração
  comercial de cliente em manifesto técnico validado (infra exigida,
  variáveis de ambiente só-nomes, blockers/warnings, checklist). Sem
  provisionamento real. `lib/deployment/`. Ver
  `docs/deployment/deployment-engine.md`.
- **Brighter Tenant Engine Foundation v1** — consolida identidade
  comercial, plano, módulos, branding, domínio, target, referências de
  infra/Supabase, status comercial/técnico, responsáveis e o manifesto de
  implantação de um cliente White Label num `Tenant` só. Motor de
  prontidão (score 0–100, blockers/warnings), repositório in-memory de
  demonstração, tenant de leitura da instalação atual, tela admin
  somente-leitura (`/app/settings/operacao`), export seguro (nunca
  segredo) e CLI. Sem persistência real, sem provisionamento.
  `lib/tenants/`. Ver `docs/tenants/tenant-engine.md` e
  `docs/tenants/tenant-lifecycle.md`.
- **Brighter Provisioning Engine Foundation v1** — transforma um `Tenant` +
  seu `DeploymentManifest` num plano de execução ORDENADO: catálogo
  canônico de etapas, dependências (com detecção de ciclo), status por
  etapa e por run, blockers/warnings, fingerprint determinístico (sem
  segredo), dry-run/simulação determinística, plano de rollback teórico
  (nunca executado) e logs estruturados sanitizados. Executor abstrato só
  com adaptadores fake/noop (`NoopProvisioningAdapter`,
  `InMemoryProvisioningAdapter`) — nenhuma infraestrutura real é criada.
  Tela admin somente-leitura (`/app/settings/provisionamento`) e CLI
  (`pnpm provisioning:plan`). Mesma doutrina de camada de domínio pura das
  fundações anteriores: sem persistência real (plano recalculado em
  memória a cada chamada), sem tabela, sem migration. `lib/provisioning/`.
  Ver `docs/provisioning/provisioning-engine.md`,
  `docs/provisioning/provisioning-lifecycle.md` e
  `docs/provisioning/rollback-strategy.md`.

- **Brighter Control Plane Foundation v1** — agrega TODAS as instalações
  White Label da Brighter num único tipo (`Installation` = `Tenant` +
  `DeploymentManifest` + `ProvisioningSummary` + branding + módulos), com
  vocabulário PRÓPRIO de status (`InstallationStatus`/`CommercialStatus`/
  `TechnicalStatus` — a visão da Brighter sobre a instalação, distinta do
  `commercialStatus`/`technicalStatus` que o próprio `Tenant` já rastreia
  sobre si mesmo), catálogo de metadados de status (label/descrição/
  categoria), validação estrutural que impede `deployment`/`branding`/
  `modules` divergirem do `tenant` embutido, repositório in-memory
  (`InMemoryInstallationRepository`) com create/update/archive/list/find/
  filter/countByStatus, filtros compostos (plano/status/domínio/empresa/
  módulo/marca/data) e resumo agregado (dashboard). Tela admin
  somente-leitura (`/app/settings/control-plane`) e CLI
  (`pnpm control:summary`). Mesma doutrina de camada de domínio pura das
  fundações anteriores: sem persistência real, sem tabela, sem migration,
  sem API, sem Docker/VPS/Supabase/DNS. `lib/control-plane/`. Ver
  `docs/control-plane/control-plane.md`, `docs/control-plane/lifecycle.md`
  e `docs/control-plane/status.md`.

- **Brighter Monitoring Engine Foundation v1** — representa, calcula e
  resume a saúde operacional de cada instalação White Label a partir do
  agregado `Installation` da Control Plane. Catálogo canônico de ~37 checks
  (aplicação, domínio, DNS, SSL, banco, auth, storage, Redis, worker,
  scheduler, e-mail, WhatsApp/WAHA, backup), filtrados por plano + módulos
  habilitados + infraestrutura do manifesto (nunca exige Redis/worker/
  scheduler no Lite, nunca exige WhatsApp sem `channel.whatsapp` ativo).
  Motor de avaliação determinístico (saúde geral, score 0–100, blockers/
  warnings, checks ausentes/atrasados), incidentes derivados dos checks em
  falha (open/acknowledged/investigating/resolved/ignored, com
  deduplicação), repositório in-memory (`InMemoryMonitoringRepository`),
  adaptadores fake/noop (`NoopMonitoringAdapter`, `InMemoryMonitoringAdapter`,
  `FakeMonitoringAdapter`) e simulação determinística
  (`simulateMonitoringRun`, 13 cenários). Integração com a Control Plane via
  view model próprio (`attachMonitoringSnapshotToInstallationSummary`),
  sem alterar `lib/control-plane/*`. Tela admin somente-leitura
  (`/app/settings/monitoramento`) e CLI (`pnpm monitoring:summary`). Mesma
  doutrina de camada de domínio pura das fundações anteriores: nenhum
  check real, sem persistência real, sem tabela, sem migration, sem API,
  sem cron/worker reais. `lib/monitoring/`. Ver
  `docs/monitoring/monitoring-engine.md`,
  `docs/monitoring/monitoring-lifecycle.md`, `docs/monitoring/incidents.md`
  e `docs/monitoring/check-catalog.md`.

## Atual

- **Brighter Billing Engine Foundation v1** — domínio comercial/financeiro
  de cada instalação White Label a partir do agregado `Installation` da
  Control Plane. Catálogo comercial (Lite/Pro/Dedicated, preços placeholder
  de demonstração — valor real fica pra futura configuração na Control
  Plane), assinatura com máquina de estados (draft/trial/active/past_due/
  grace_period/suspended/cancelled/expired), invoice em centavos (nunca
  ponto flutuante, total nunca negativo), descontos percentuais/fixos e
  créditos, entitlement de módulo (`resolveBillingEntitlements` — nunca
  concede o que o Module Engine já negou; `DISABLED_MODULES` mantém
  precedência; assinatura suspensa nunca remove dado, módulos `core.*`
  seguem acessíveis em modo restrito), consumo vs. limites contratados
  (só recomenda, nunca bloqueia), upgrade imediato/downgrade agendado pro
  fim do período, cancelamento imediato/ao fim do ciclo, eventos de
  domínio, repositório in-memory (`InMemoryBillingRepository`),
  adaptadores fake/noop de provedor de pagamento (`NoopBillingProviderAdapter`,
  `FakeBillingProviderAdapter` — sem InfinitePay/Stripe/Mercado Pago/Pix/
  boleto/cartão) e simulação determinística (`simulateBillingScenario`, 22
  cenários). Integração com a Control Plane via view model próprio
  (`attachBillingSummaryToInstallationSummary`), sem alterar
  `lib/control-plane/*`; separação estrutural de responsabilidade com o
  Monitoring Engine (Billing nunca decide saúde técnica, Monitoring nunca
  decide cobrança). Tela admin somente-leitura (`/app/settings/billing`) e
  CLI (`pnpm billing:summary`). Mesma doutrina de camada de domínio pura
  das fundações anteriores: sem gateway, sem cobrança real, sem nota
  fiscal, sem persistência real, sem tabela, sem migration, sem API.
  `lib/billing/`. Ver `docs/billing/billing-engine.md`,
  `docs/billing/subscription-lifecycle.md`,
  `docs/billing/invoices-and-payments.md`,
  `docs/billing/entitlements-and-limits.md` e
  `docs/billing/provider-adapters.md`.

## Próximos

Ordem alvo, cada uma consumindo (nunca substituindo) as camadas de domínio
das fundações anteriores — ver "Doutrina de engine" em
`docs/architecture/brighter-platform.md`:

- **Automation Engine Foundation** — execução real de automações hoje só
  declarativas (`automation.webhooks`/`automation.followups`).
- **Outreach & AI Cadence Engine** — envio em massa e cadências multi-etapa
  com IA por campanha (`automation.campaigns`, hoje `status: "planned"` no
  Module Engine). IA aqui é capacidade consumida pelo módulo, não uma
  engine própria (ver nota abaixo). Ver
  `docs/modules/campaigns-and-cadences.md`.
- **Provisioning Adapters Foundation** — implementações de verdade de
  `ProvisioningAdapter` (Supabase, Vercel/Cloudflare, VPS, DNS, Caddy,
  WhatsApp/WAHA, e-mail, IA), plugadas no executor já existente em
  `lib/provisioning/executor.ts` sem mudar sua interface.
- **Marketplace / Module Licensing Foundation** — configuração de módulos
  pelo painel (hoje só por env var `ENABLED_MODULES`/`DISABLED_MODULES`) e
  descoberta/instalação de módulos de terceiros.
- **Adaptadores reais de billing** — implementações de verdade de
  `BillingProviderAdapter` (InfinitePay/Stripe/Mercado Pago/Pix/boleto),
  plugadas em `lib/billing/adapters.ts` sem mudar sua interface.
- **Persistência real da Control Plane** — primeiro consumidor real de
  **persistência** de `Installation`/`Tenant`/`ProvisioningPlan`/
  `MonitoringSnapshot`/`BillingSubscription`/`BillingInvoice` (tabela,
  migration, banco próprio da Brighter — nunca dentro do banco de um
  cliente), implementando as MESMAS interfaces `InstallationRepository`/
  `MonitoringRepository`/`BillingRepository` já definidas (ex.: um futuro
  `SupabaseInstallationRepository`), nunca reimplementando tipos/
  validação/readiness já existentes.
- **Adaptadores reais de monitoramento** — implementações de verdade de
  `MonitoringAdapter` (ping HTTP, resolução DNS, validade SSL, Supabase,
  Redis, WAHA), plugadas no motor já existente em `lib/monitoring/` sem
  mudar sua interface.
- **Suporte e SLA** — canal e processo formal de suporte por tenant.

**Nota sobre IA:** IA é capacidade opcional consumida por módulos
específicos (`ai.agents`/`ai.memory`/`ai.rag`, e futuros módulos de
Outreach/Atendimento/Comercial) — não é uma engine estrutural
independente. Removida do roadmap como fundação própria.
