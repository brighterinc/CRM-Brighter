---
type: index
project: DeskcommCRM
status: draft
last_updated: 2026-07-29
generated_by: auditoria documental (Claude Code)
confidence: alta (inventário de arquivos é CONFIRMADO; agrupamento temático é INFERIDO)
audited_against: origin/main @ 789dfa6 (v1.0.0, 2026-07-27)
---

# Índice da documentação — DeskcommCRM

Mapa dos **127** arquivos `.md` de `docs/`, espalhados por **24** subpastas (+8 arquivos/+1 subpasta — `docs/outreach/`, adicionados com a Outreach & AI Cadence Engine Foundation v1; +9 arquivos/+1 subpasta — `docs/marketplace/`, adicionados com a Marketplace / Module Licensing Foundation v1) — régua:
`git ls-files 'docs/**/*.md' | wc -l`. Existe porque a documentação cresceu sem ponto
de entrada: sem este índice, humano e agente não acham o que já foi decidido e
reescrevem por cima.

**Regra de precedência quando dois docs discordam:**
`CLAUDE.md` (doutrina) > `docs/specs/` (contrato técnico) > `docs/prd/` (intenção) >
`HANDOFF-*.md` (estado de sessão) > README. Se achou divergência, corrija a fonte
de menor precedência e registre.

---

## 1. Comece por aqui

| Doc | Para quê |
|---|---|
| [`README.md`](../README.md) | O que é, quickstart de 5 min, stack, roadmap. Também em [EN](../README.en.md) / [ES](../README.es.md) |
| [`VISION.md`](../VISION.md) | Posicionamento, por que self-host, para quem |
| [`ARCHITECTURE.md`](../ARCHITECTURE.md) | Arquitetura em 1 página |
| [`AGENTS.md`](../AGENTS.md) | Contrato para agentes de código (qualquer ferramenta) |
| [`CLAUDE.md`](../CLAUDE.md) | **Doutrina não-negociável.** Convenções, anti-patterns, Definition of Done |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Como contribuir |
| [`CHANGELOG.md`](../CHANGELOG.md) | Mudanças por versão (SemVer). **Quem roda VPS lê antes de `update.sh`** — mudança que exige ação manual aparece sob "⚠️ Requer atenção" |
| [`docs/current-state.md`](current-state.md) | **O que está pronto, incompleto e quebrado hoje** |

## 2. Produto e intenção

| Doc | Conteúdo |
|---|---|
| [`prd/00-prd-master.md`](prd/00-prd-master.md) | PRD mestre — visão, escopo MVP, KPIs, restrições |
| [`prd/01-prd-platform-base.md`](prd/01-prd-platform-base.md) | Auth, tenancy, RBAC, framework LGPD |
| [`prd/02-prd-customer-360.md`](prd/02-prd-customer-360.md) | Customer 360 + identity resolution determinística |
| [`prd/03-prd-whatsapp-waha.md`](prd/03-prd-whatsapp-waha.md) | Canal WhatsApp, anti-banimento, janela 24h |
| [`prd/04-prd-pipeline-attendance.md`](prd/04-prd-pipeline-attendance.md) | Kanban, atendimento, tickets, handoff |
| [`prd/05-prd-ai-rag-handoff.md`](prd/05-prd-ai-rag-handoff.md) | IA conversacional, RAG por tenant, sentiment |
| [`prd/06-prd-nuvemshop-lgpd.md`](prd/06-prd-nuvemshop-lgpd.md) | Integração Nuvemshop + webhooks LGPD |
| [`business-rules/00-business-rules-catalog.md`](business-rules/00-business-rules-catalog.md) | **Catálogo de regras de negócio** — fonte da verdade fora do código |
| [`presentation/pitch-deck.md`](presentation/pitch-deck.md) | Pitch |

## 3. Contrato técnico (specs)

Detalham schema SQL e payloads exatos. **Consulte antes de modelar qualquer coisa.**

| Spec | Domínio |
|---|---|
| [`specs/01`](specs/01-spec-platform-base.md) | Plataforma base — tenancy, RLS, RBAC, API, audit |
| [`specs/02`](specs/02-spec-customer-360.md) | Customer 360 |
| [`specs/03`](specs/03-spec-whatsapp-waha.md) | WAHA — fila outbound, warm-up, spinning, crons |
| [`specs/04`](specs/04-spec-pipeline-attendance.md) | Pipeline e atendimento |
| [`specs/05`](specs/05-spec-ai-rag-handoff.md) | IA, RAG, gatilhos de handoff |
| [`specs/06`](specs/06-spec-nuvemshop-lgpd.md) | Nuvemshop + LGPD |
| [`specs/07`](specs/07-spec-events-workers.md) | **`event_log`, workers, claim atômico, backoff/DLQ** |
| [`specs/08`](specs/08-spec-deploy-observability.md) | Deploy e observabilidade |
| [`specs/09`](specs/09-spec-frontend-backend-integration.md) | Integração front/back |
| [`specs/10`](specs/10-spec-ai-agents-runtime.md) | Runtime dos AI Agents |
| [`specs/11`](specs/11-spec-mcp-server-internal.md) | MCP server interno + catálogo de tools |
| [`specs/12`](specs/12-spec-ai-agents-ui.md) | UI dos AI Agents |
| [`specs/13`](specs/13-spec-governanca-atendimento.md) | Governança de atendimento (épico G1–G6) |
| [`specs/14`](specs/14-contrato-governanca-agentes-externos.md) | Contrato para agentes de IA externos |
| [`specs/15`](specs/15-spec-casos-humanos.md) | Casos humanos (IA delega a humano) |
| [`specs/RECONCILIATION-LOG.md`](specs/RECONCILIATION-LOG.md) | Log de reconciliação entre specs |

## 4. Doutrina e arquitetura

| Doc | Conteúdo |
|---|---|
| [`doctrine/sistema-vivo.md`](doctrine/sistema-vivo.md) | **Doutrina do Sistema Vivo** — 5 invariantes + Living System Checklist (item 13 do DoD) |
| [`architecture/agent-turn.html`](architecture/agent-turn.html) | Diagrama do turno do agente (inbound → guardrails → outbound) |
| [`research/architecture-diagrams.md`](research/architecture-diagrams.md) | Diagramas de arquitetura |
| [`research/reference-synthesis.md`](research/reference-synthesis.md) | Arquitetura herdada da referência WAHA |
| [`research/followup-reference-mining.md`](research/followup-reference-mining.md) | Pesquisa do motor de follow-up |
| [`threat-model.md`](threat-model.md) | **Superfície de ataque real do self-host** |
| [`architecture/brighter-platform.md`](architecture/brighter-platform.md) | **Brighter Platform Architecture** — mapa entre as fundações White Label Runtime → Module Engine → Deployment Engine → Tenant Engine → Provisioning Engine → Control Plane → Monitoring Engine → Billing Engine → Automation Engine → Outreach & AI Cadence Engine → Marketplace / Module Licensing Engine, planos comerciais Lite/Pro/Dedicated |
| [`modules/module-engine.md`](modules/module-engine.md) | Module Engine — catálogo tipado de módulos, planos de implantação (Lite/Pro/Dedicated), regras de resolução |
| [`modules/campaigns-and-cadences.md`](modules/campaigns-and-cadences.md) | Spec futura de `automation.campaigns` (envio em massa e cadências) — **não implementado ainda** |
| [`deployment/deployment-engine.md`](deployment/deployment-engine.md) | **Deployment Engine** — transforma config comercial (plano/módulos/marca/domínio) em manifesto técnico validado: infra, env vars (só nomes), blockers/warnings, checklist. Não provisiona nada |
| [`tenants/tenant-engine.md`](tenants/tenant-engine.md) | **Tenant Engine** — consolida cliente White Label (identidade, plano, módulos, branding, status comercial/técnico, referências de infra/Supabase) num `Tenant`; readiness score, export seguro, CLI. Sem persistência real |
| [`tenants/tenant-lifecycle.md`](tenants/tenant-lifecycle.md) | Ciclo comercial/técnico de um `Tenant`, e a distinção crítica entre `Tenant` (instalação White Label) vs. "tenant" de `/admin/tenants` (organização dentro de UMA instalação) |
| [`provisioning/provisioning-engine.md`](provisioning/provisioning-engine.md) | **Provisioning Engine** — transforma `Tenant` + `DeploymentManifest` num plano de execução ordenado (etapas, dependências, status, blockers, fingerprint). Sem infraestrutura real, só adaptadores fake/noop |
| [`provisioning/provisioning-lifecycle.md`](provisioning/provisioning-lifecycle.md) | Ciclo de vida de um `ProvisioningPlan` e de cada `ProvisioningStepState` — estados possíveis e transições |
| [`provisioning/rollback-strategy.md`](provisioning/rollback-strategy.md) | Estratégia de rollback teórico — o que é revertível hoje, o que nunca é sugerido automaticamente (ex.: remoção de VPS), e o que fica pra adaptadores reais futuros |
| [`control-plane/control-plane.md`](control-plane/control-plane.md) | **Control Plane** — agrega TODAS as instalações White Label da Brighter (`Installation` = `Tenant` + `DeploymentManifest` + `ProvisioningSummary` + branding + módulos), vocabulário próprio de status, repositório in-memory, filtros, resumo agregado. Sem persistência real |
| [`control-plane/lifecycle.md`](control-plane/lifecycle.md) | Ciclo de vida de uma `Installation` — estados e transições de `InstallationStatus`/`CommercialStatus`/`TechnicalStatus` |
| [`control-plane/status.md`](control-plane/status.md) | Catálogo de referência rápida dos três vocabulários de status e seus metadados (label/descrição/categoria) |
| [`monitoring/monitoring-engine.md`](monitoring/monitoring-engine.md) | **Monitoring Engine** — representa, calcula e resume a saúde operacional de cada instalação a partir do `Installation` da Control Plane: catálogo de ~37 checks, motor de avaliação (saúde geral, score, blockers/warnings), incidentes derivados, adaptadores fake/noop, simulação. Sem check real |
| [`monitoring/monitoring-lifecycle.md`](monitoring/monitoring-lifecycle.md) | Estados de um `MonitoringSnapshot`/`MonitoringCheckStatus`, regra de `overallHealth` e os 13 cenários de `simulateMonitoringRun` |
| [`monitoring/incidents.md`](monitoring/incidents.md) | Ciclo de vida de um `MonitoringIncident` — derivação, deduplicação e transições open/acknowledged/resolved/reopened |
| [`monitoring/check-catalog.md`](monitoring/check-catalog.md) | Tabela completa dos ~37 checks do catálogo — plano, módulos/infra exigidos, severidade, cadência |
| [`billing/billing-engine.md`](billing/billing-engine.md) | **Billing Engine** — domínio comercial/financeiro de cada instalação: plano comercial (Lite/Pro/Dedicated), assinatura, ciclo, invoice, entitlement de módulo, consumo/limites, descontos/créditos, upgrade/downgrade, grace period, cancelamento. Sem gateway, sem cobrança real |
| [`billing/subscription-lifecycle.md`](billing/subscription-lifecycle.md) | Estados de `SubscriptionStatus` e transições — draft/trial/active/past_due/grace_period/suspended/cancelled/expired |
| [`billing/invoices-and-payments.md`](billing/invoices-and-payments.md) | Ciclo de vida de uma `BillingInvoice`, aritmética em centavos, descontos/créditos — total nunca negativo, nunca imposto inventado |
| [`billing/entitlements-and-limits.md`](billing/entitlements-and-limits.md) | `resolveBillingEntitlements` — precedência do Module Engine sobre o Billing, limites de consumo, "assinatura suspensa nunca remove dado" |
| [`billing/provider-adapters.md`](billing/provider-adapters.md) | `BillingProviderAdapter` fake/noop — nenhuma integração real com InfinitePay/Stripe/Mercado Pago/Pix/boleto/cartão |
| [`automation/automation-engine.md`](automation/automation-engine.md) | **Automation Engine** — modelagem de plataforma de workflows (gatilhos/condições/ações/branch/delay/retry/idempotência/histórico) de cada instalação. Distinto do motor legado `lib/automation/` (execução real por-organização) — ver tabela de comparação. Sem execução real |
| [`automation/workflow-lifecycle.md`](automation/workflow-lifecycle.md) | Estados de `WorkflowRun`/`WorkflowStepRunState`, como o executor caminha o grafo de ramificação, e os 8 cenários de `simulateWorkflowRun` |
| [`automation/action-catalog.md`](automation/action-catalog.md) | Tabela completa de `WORKFLOW_TRIGGER_CATALOG`/`WORKFLOW_ACTION_CATALOG` — módulo exigido, planos, retry/delay suportado |
| [`outreach/outreach-engine.md`](outreach/outreach-engine.md) | **Outreach & AI Cadence Engine** — domínio comercial de campanha/cadência: segmento, audiência, cadência multi-etapa, janela/throttling, templates, consentimento/opt-out, respostas, IA opcional, handoff humano. Distinto do motor de follow-up real `lib/followup/` e do Automation Engine genérico — ver tabela de comparação. Sem envio real |
| [`outreach/campaign-lifecycle.md`](outreach/campaign-lifecycle.md) | Estados de `CampaignStatus` e transições válidas — draft/scheduled/active/paused/completed/cancelled/archived/blocked |
| [`outreach/cadences.md`](outreach/cadences.md) | Grafo de `OutreachCadenceStep` e ciclo de vida de `OutreachEnrollment` — idempotência, `pending → active` direto |
| [`outreach/audience-and-consent.md`](outreach/audience-and-consent.md) | Pipeline de segmento → audiência → exclusão de inelegíveis → consentimento/opt-out (`contacts.is_blocked`/`consent` espelhados) |
| [`outreach/throttling-and-windows.md`](outreach/throttling-and-windows.md) | Janela de envio, políticas de throttling (valores reais de `lib/automation/throttle.ts`), templates e personalização |
| [`outreach/responses-and-ai.md`](outreach/responses-and-ai.md) | Classificação de resposta, adaptadores `ResponseClassifier`/`ResponseDraftGenerator` fake/noop — IA opcional, nunca AI Engine própria |
| [`outreach/human-handoff.md`](outreach/human-handoff.md) | `evaluateHumanHandoff`/`deriveRecommendedOwnerAction` — preview, nunca atribui vendedor real |
| [`outreach/simulation.md`](outreach/simulation.md) | Os 23 cenários de `simulateOutreachScenario` e a regra de exit code da CLI (`pnpm outreach:summary`) |
| [`marketplace/marketplace-engine.md`](marketplace/marketplace-engine.md) | **Marketplace / Module Licensing Engine** — catálogo comercial, ofertas, bundles, licenças, trials, elegibilidade, entitlement e plano de ativação teórico. Distinto do Module Engine (técnico) e do Billing Engine (financeiro) — ver tabela de comparação. Sem ativação real |
| [`marketplace/module-catalog.md`](marketplace/module-catalog.md) | Catálogo comercial e sua validação contra `MODULE_CATALOG` do Module Engine |
| [`marketplace/offers-and-bundles.md`](marketplace/offers-and-bundles.md) | Ciclo de vida de `MarketplaceOffer` e `MarketplaceBundle` |
| [`marketplace/licenses.md`](marketplace/licenses.md) | Estados de `LicenseStatus` e transições válidas |
| [`marketplace/trials.md`](marketplace/trials.md) | Estados de `TrialStatus` e a regra "trial nunca passa por Billing" |
| [`marketplace/entitlements.md`](marketplace/entitlements.md) | `evaluateModuleEligibility` (prospectivo) x `resolveMarketplaceEntitlements` (estado atual) |
| [`marketplace/activation-plans.md`](marketplace/activation-plans.md) | `generateModuleActivationPlan` — plano teórico, nunca ativação real |
| [`marketplace/versioning.md`](marketplace/versioning.md) | Comparação SemVer, `planVersionUpgrade`/`planVersionDowngrade` |
| [`marketplace/simulation.md`](marketplace/simulation.md) | Os 26 cenários de `simulateMarketplaceScenario` e a regra de exit code da CLI (`pnpm marketplace:summary`) |

## 5. Design system

[`design-system/README.md`](design-system/README.md) é o ponto de entrada (v1.0, 5 escolhas
visuais lockadas: paleta Sage, Atkinson Hyperlegible, densidade aerada, Phosphor duotone,
IBM Plex Mono). Numerados `00`–`09`: overview, tokens, paleta, tipografia, densidade,
iconografia, componentes, motion, voice & tone, **anti-patterns**.
Fluxo de tela em `design-system/screen-flow/` (jornadas, clickflows, máquinas de estado,
acessibilidade).

## 6. Operar e instalar

| Doc | Conteúdo |
|---|---|
| [`SETUP.md`](SETUP.md) | Guia completo de env vars e setup local |
| [`deploy-selfhost/README.md`](deploy-selfhost/README.md) | Self-host genérico |
| [`deploy-hostgator/README.md`](deploy-hostgator/README.md) | VPS HostGator (`install.sh`, `backup.sh`, `reset-mfa.sh`) |
| [`DEPLOY-CHECKLIST.md`](DEPLOY-CHECKLIST.md) | Checklist de deploy |
| [`ATUALIZANDO.md`](ATUALIZANDO.md) | `update.sh`, `restore.sh`, `healthcheck.sh` |
| [`runbooks/waha-hostgator.md`](runbooks/waha-hostgator.md) | Runbook do WAHA em produção |
| [`runbooks/ai-credentials-rotation.md`](runbooks/ai-credentials-rotation.md) | Rotação de credenciais de IA |
| [`../SECURITY.md`](../SECURITY.md) | Política de reporte de vulnerabilidade |

## 7. Testes e QA

| Doc | Conteúdo |
|---|---|
| [`testing/user-journey-map.md`](testing/user-journey-map.md) | **Mapa de jornadas vivo** — casos, prioridade `[P0]`, achados. Atualizar sempre |
| [`testing/HANDOFF-vps-qa.md`](testing/HANDOFF-vps-qa.md) | Receita do ambiente fresco estilo VPS |
| [`harness-audit.md`](harness-audit.md) | **Auditoria do harness** — 20 itens + nível de maturidade |
| [`../tests/e2e/README.md`](../tests/e2e/README.md) | Como rodar os E2E |

## 8. Execução — planos, épicos, handoffs

Documentação de *processo*. Alta rotatividade; trate como estado, não como contrato.

**Convenção observada:** épico **vivo** mantém o HANDOFF na **raiz** do repo; épico
**encerrado** é arquivado em [`handoffs/`](handoffs/). Use isso para saber o que está em voo.

- **Raiz (em voo):** `HANDOFF.md` (follow-up), `HANDOFF-harness-evolution.md`, `HANDOFF-operacao-visivel.md`
- [`handoffs/`](handoffs/) — arquivados: casos humanos, inbox multimodal, CRM vivo, LGPD, wave1-devvivo, contrato wave5, briefing CRM vivo
- [`stories/`](stories/) — épicos e stories (`epics/MASTER.md` = plano por epic/wave)
- [`superpowers/`](superpowers/) — `plans/` e `specs/` datados por onda, mais `handoffs/`
- [`growth/`](growth/) — material de crescimento · [`brand/`](brand/) — marca · [`white-label.md`](white-label.md) — instalação com marca própria
- [`../plan/`](../plan/) — backlog do gov-loop (`features.json` 31/31, `phases.md`, `progress.md`)
- [`../loop/`](../loop/) — máquina do gov-loop (`LOOP.md`, `CHECKPOINT.md`, `checkpoints/G1..G6-report.md` + `.approved`)
- [`../tasks/todo.md`](../tasks/todo.md) — workflow de construção original (Fase 0 → PRD → specs)

## 9. Grafo de conhecimento

`graphify-out/` — grafo do repositório (7310 nós, 17705 arestas, 538 comunidades na última
geração). Consulte via skill `graphify` antes de varrer código bruto. `GRAPH_REPORT.md` traz
god nodes, hyperedges e comunidades. **Gerado — não editar.** ⚠️ Foi gerado contra uma árvore
anterior à v1.0.0; regenere (`/graphify .`) antes de confiar em detalhe fino.

---

## Lacunas conhecidas deste índice

- `docs/vendaval-fusion-plan.md` e `docs/vendaval-vps-deploy-comandos.md` referem-se a uma
  integração ("Vendaval") cujo status é **A CONFIRMAR** — o README **não a lista mais** em
  "Próximo", apesar de o gatilho (`loop/checkpoints/G6.approved`) existir.
- `docs/diagrams/` não tem `.md` e não foi inventariado. `docs/evidence/` é evidência visual
  (18 PNGs), não documentação de leitura.
- `docs/architecture/` contém só o diagrama do agent-turn; a doutrina (`CLAUDE.md`, DoD item 13)
  pede que o "mapa vivo" da arquitetura reflita toda peça nova com ≥2 arestas — **NÃO IDENTIFICADO**
  se isso está sendo cumprido, e é a lacuna documental mais relevante que sobrou.
- `docs/growth/` (3 docs) e `docs/brand/` (1) não foram lidos em detalhe — classificados por
  nome de pasta, portanto **INFERIDO**.
