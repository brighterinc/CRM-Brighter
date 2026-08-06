---
type: architecture
status: v1 — fundação
last_updated: 2026-08-04
---

# Brighter Outreach & AI Cadence Engine

> Fundação que modela "o que uma instalação White Label PODE fazer em
> outreach/cadência de campanha": campanhas, segmentos, audiência,
> cadências multi-etapa, janelas de envio, throttling, templates,
> personalização, consentimento/opt-out, respostas, IA opcional e handoff
> humano — como um domínio puro de simulação determinística, sem envio real
> de nenhuma mensagem. Consome `Installation` da Control Plane
> (`lib/control-plane/`), `MODULE_CATALOG` do Module Engine, entitlement do
> Billing Engine e saúde de canal do Monitoring Engine — nunca reimplementa
> nenhum deles. "Outreach & AI Cadence Engine" é nome interno de código; a
> tela voltada ao usuário final chama isso de "Outreach & Cadências"
> (`/app/settings/outreach`).

## Diferença entre Outreach e Automation

Este repositório tem TRÊS sistemas em níveis de abstração diferentes que
tocam "automação" — nunca confundir:

| | `lib/followup/` (motor legado do CRM) | `lib/automation-engine/` (orquestração genérica) | `lib/outreach/` (esta Foundation) |
|---|---|---|---|
| Nível | Execução REAL de follow-up 1:1, DB-backed | Modelagem de PLATAFORMA da capacidade de automação genérica | Modelagem de PLATAFORMA da capacidade COMERCIAL de outreach em massa/cadência |
| Disparo | `followup_enrollments` reais (Postgres), grafo de nós | Simulação em memória, `WorkflowRun` nunca persistido de verdade | Simulação em memória, `OutreachEnrollment` nunca persistido de verdade |
| Ações | Envia mensagem real via `enqueue_turn`→agente→WAHA | Adaptador fake/noop apenas | Adaptador fake/noop apenas |
| Tabelas | `followup_flow_versions`, `followup_enrollments`, etc. (Postgres, RLS) | Nenhuma — `InMemoryWorkflowRepository` | Nenhuma — `InMemoryOutreachRepository` |
| Módulo do catálogo | `automation.followups` (`status: "stable"`) | Consome `MODULE_CATALOG` pra entitlement | Consome `MODULE_CATALOG` pra entitlement — sempre `automation.campaigns` (`status: "planned"`) |
| Onde mora | `lib/followup/` | `lib/automation-engine/`, `app/app/settings/automacao/` | `lib/outreach/`, `app/app/settings/outreach/` |

`lib/outreach/` **nunca importa nem é importado por** `lib/followup/*` nem
`lib/automation/*` (motor legado). Onde a Outreach Engine PRECISA
representar sua relação com o Automation Engine genérico (a orquestração
que, numa fase futura, dispararia de verdade os steps de uma cadência), ela
usa só um VIEW MODEL (`lib/outreach/integrations.ts::mapCadenceToAutomationView`/
`mapEnrollmentToAutomationExecutionView`) — nunca um `WorkflowDefinition`/
`WorkflowRun` real, nunca importa `lib/automation-engine/executor.ts`. A
Automation Engine continua responsável pela orquestração genérica de
gatilho/ação; a Outreach Engine é responsável pelas regras ESPECÍFICAS de
campanha e comunicação (segmentação, consentimento, throttling de canal,
classificação de resposta).

## Objetivo

Antes desta fundação, "campanha"/"cadência" só existia como o módulo
`automation.campaigns` (`status: "planned"` no Module Engine) e um spec
funcional futuro (`docs/modules/campaigns-and-cadences.md`) — nenhuma
representação de domínio, nenhuma simulação, nenhuma tela. A Outreach & AI
Cadence Engine resolve isso permanecendo — como toda fundação anterior —
uma camada de domínio pura: sem envio real, sem IA real, sem agendamento
real, sem persistência real.

## Princípios (mesma doutrina das fundações anteriores)

- **Camada de domínio, não CRUD.** Tipos, catálogo, validação, segmentação,
  cadência, enrollments, templates, throttling, respostas/IA opcional,
  handoff, métricas, repositório in-memory, simulação, resumo — nunca uma
  API REST nova, nunca uma tabela, nunca uma Edge Function, nunca fila/
  cron/worker/canal reais.
- **Consome `Installation`/`MODULE_CATALOG`/Billing/Monitoring, nunca
  duplica.** `validateCadence`/`validateCampaign`/`validateOutreachEntitlement`/
  `evaluateChannelHealthForOutreach` recebem sempre o necessário derivado
  das fundações anteriores — nunca reimplementam a noção de módulo
  habilitado, entitlement comercial ou saúde de canal.
- **`automation.campaigns` é `status: "planned"` — nunca autorizado em
  produção nesta Foundation**, mesma regra de `resolveBillingEntitlements`/
  `validateWorkflowDefinition`. TODA entrada do catálogo de campanha exige
  esse módulo — por construção, nenhuma campanha real é possível ainda.
  Isso é esperado, não um bug.
- **Opt-out sempre tem precedência.** `contacts.is_blocked` (irrevogável,
  STOP-detection) é espelhado, nunca contradito — ver
  [`audience-and-consent.md`](audience-and-consent.md).
- **IA nunca envia mensagem diretamente.** Classificação/rascunho/handoff
  são só SUGESTÕES — ver [`responses-and-ai.md`](responses-and-ai.md) e
  [`human-handoff.md`](human-handoff.md).
- **Delay/janela/throttling nunca usam `setTimeout`/cron/timer real.**
  Sempre aritmética sobre um `now: Date` explícito.
- **Sem persistência real.** Só existe `InMemoryOutreachRepository`.
- **Nenhuma dependência da Lumina.** Nenhum arquivo de `lib/outreach/*` lê,
  escreve ou referencia `/opt/brighter-lumina` (porta 8000).

## Arquitetura

```
lib/outreach/
  types.ts          — OutreachCampaign/OutreachCadence/OutreachEnrollment/etc.
  status.ts         — tabelas de transição válida (campanha/cadência/enrollment/delivery)
  catalog.ts        — tipos de campanha/etapa/classificação/bloqueio/throttling/opt-out/IA
  validation.ts     — validateSegment/validateCadence/validateCampaign (entitlement + estrutura + ciclo)
  segments.ts        — evaluateContactAgainstSegment/matchSegmentAudience/deduplicateAudience
  audiences.ts        — excludeIneligibleContacts/buildAudiencePreview/calculateAudienceSummary
  campaigns.ts          — ciclo de vida (createCampaign..archiveCampaign)
  cadences.ts             — grafo de etapas (resolveNextCadenceStep/calculateNextStepAt) + pause/resume/cancel/complete
  enrollments.ts            — ciclo de vida por contato (createEnrollment..completeEnrollment), idempotência
  templates.ts                — validateTemplate/extractTemplateVariables/detectMissingVariables
  personalization.ts            — personalizeOutreachContent (fallback, nunca eval)
  scheduling.ts                    — isInsideSendingWindow/calculateNextAllowedSendAt
  throttling.ts                      — evaluateThrottle/calculateThrottleDelay
  adapters.ts                          — OutreachChannelAdapter/ResponseClassifier/ResponseDraftGenerator (Noop/Fake)
  responses.ts                           — classifyOutreachResponse (via ResponseClassifier injetado)
  handoff.ts                                — evaluateHumanHandoff/deriveRecommendedOwnerAction
  consent.ts                                   — evaluateContactEligibility/applySuppressionRules
  metrics.ts                                      — calculateOutreachMetrics (response/qualification/opt-out/failure rate)
  repository.ts                                      — OutreachRepository + InMemoryOutreachRepository + createDemoCampaigns()
  integrations.ts                                       — Billing entitlement, Monitoring saúde, Automation view model, Control Plane attach
  simulation.ts                                            — simulateOutreachScenario() (24 cenários determinísticos)
  sanitization.ts                                             — reexporta sanitizeDeep (lib/tenants/export.ts) — nunca reimplementa
  summary.ts                                                     — generateOutreachSummary()
  index.ts                                                          — barrel público (export *)

app/app/settings/outreach/page.tsx   — tela admin-only, somente leitura
scripts/generate-outreach-summary.ts — CLI (pnpm outreach:summary)
```

Nenhum arquivo de `lib/outreach/*` lê `process.env` — `sanitization.ts`
importa `sanitizeDeep` de `@/lib/tenants/export` diretamente (nunca o
barrel `@/lib/tenants`, mesmo cuidado documentado em
`lib/automation-engine/index.ts`/`lib/billing/index.ts`/`lib/monitoring/index.ts`).

## Catálogo (`catalog.ts`)

Tipos de campanha (`OUTREACH_CAMPAIGN_TYPE_CATALOG`), tipos de etapa de
cadência, classificações de resposta, motivos de bloqueio, políticas de
throttling de referência (WhatsApp 1:1 vs. campanha — mesmos números REAIS
de `lib/automation/throttle.ts`/CLAUDE.md §WAHA), motivos de opt-out e
capacidades de IA opcional. TODA entrada de campanha exige
`automation.campaigns` — mesmo padrão de `campaign_step_due` em
`lib/automation-engine/catalog.ts`.

## Segmentação, audiência e cadência

Ver [`audience-and-consent.md`](audience-and-consent.md) para o pipeline
completo de segmento → audiência → exclusão de inelegíveis → consentimento,
e [`cadences.md`](cadences.md) para o grafo de etapas e o ciclo de vida de
enrollment.

## Janela de envio, throttling e templates

Ver [`throttling-and-windows.md`](throttling-and-windows.md).

## Respostas, IA opcional e handoff humano

Ver [`responses-and-ai.md`](responses-and-ai.md) e
[`human-handoff.md`](human-handoff.md).

## Resumo (`summary.ts`)

`generateOutreachSummary({installation, campaigns, cadences, enrollments,
metrics})` — view model JSON com contagem de campanhas/enrollments por
status, métricas e blockers de configuração agregados (reusa
`validateCadence` por cadência, nunca reimplementa a checagem).
`renderOutreachSummaryMarkdown` — mesmo estilo Markdown das CLIs
anteriores.

## Tela `/app/settings/outreach`

Server Component admin-only, mesmo guard de
`/app/settings/automacao`/`/app/settings/monitoramento`
(`requireAuth()` + `resolveActiveOrg()` +
`ROLE_RANK[...] >= ROLE_RANK.admin` OU `is_platform_admin`, senão
`redirect("/403")`). Somente leitura — sem botão de disparo real. Mostra:
instalação atual, público/envio, qualificação/opt-out, janela/throttling,
blockers/avisos, tabela de campanhas, tabela de enrollments recentes e o
resumo em Markdown (cenário `"healthy"` simulado na própria renderização).

## CLI (`pnpm outreach:summary`)

```bash
pnpm outreach:summary -- --client "Empresa Exemplo" --slug empresa-exemplo \
  --domain crm.empresa.com.br --plan dedicated \
  --modules core.contacts,channel.whatsapp,automation.campaigns,ai.agents \
  --scenario healthy --format markdown
```

Ver [`simulation.md`](simulation.md) para a lista completa dos 23
cenários e a regra de exit code.

## Relação com as fundações anteriores

```
White Label Runtime → Module Engine → Deployment Engine → Tenant Engine → Provisioning Engine → Control Plane
                                                                                                        ↓ licenciado/cobrado por
                                                                                                 Billing Engine
                                                                                                        ↓ observado por
                                                                                              Monitoring Engine
                                                                                                        ↓ automatizado por
                                                                                             Automation Engine
                                                                                                        ↓ especializado por
                                                                                    Outreach & AI Cadence Engine
```

Nunca duplica: reusa o agregado `Installation` da Control Plane, o
`MODULE_CATALOG` do Module Engine, `resolveBillingEntitlements` do Billing
Engine e `MonitoringSnapshot` do Monitoring Engine. Ver mapa completo em
[`docs/architecture/brighter-platform.md`](../architecture/brighter-platform.md).

## Limitações da Foundation v1

- **Nenhum envio real** — `adapters.ts` só tem `NoopOutreachChannelAdapter`
  e `FakeOutreachChannelAdapter`; nenhum adaptador chama WAHA, Meta Cloud,
  SMTP ou SMS.
- **Nenhuma IA real** — `ResponseClassifier`/`ResponseDraftGenerator` só
  têm implementações `Noop`/`Fake` (palavra-chave determinística); nenhuma
  chamada ao Vercel AI Gateway/Anthropic/OpenAI.
- **Nenhum agendamento real** — janela/throttling só calculam timestamps;
  não existe cron/worker/fila que "acorde" um enrollment automaticamente.
  Quem avança o relógio nesta Foundation é sempre quem chama
  (teste/simulação/CLI).
- **Não persiste nada de verdade** — `InMemoryOutreachRepository` vive só
  na memória do processo.
- **Nenhuma regra jurídica nova** — validação legal real (base LGPD,
  jurisdição) depende da operação de cada tenant, nunca decidida por este
  engine (`consent.ts::LEGAL_BASIS_NOTE`).
- **`automation.campaigns` continua `status: "planned"`** — nenhuma
  campanha real pode ser ativada até esse módulo ser promovido a `stable`
  numa fase futura ("Outreach Runtime real" — ver ROADMAP.md).

## Confirmação: esta versão não executa nada de verdade

Nenhum arquivo de `lib/outreach/*` chama rede, WhatsApp/WAHA/Meta Cloud/
SMTP/SMS, IA externa, `setTimeout`/cron/worker/fila real, ou grava em
`crm_leads`/`contacts`/tabela real de campanha. A tela e a CLI são
puramente leitura/simulação. Nenhuma peça deste engine acessa
`/opt/brighter-lumina` ou a porta 8000.
