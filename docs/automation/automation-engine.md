---
type: architecture
status: v1 — fundação
last_updated: 2026-08-04
---

# Brighter Automation Engine

> Fundação que modela "o que uma instalação White Label PODE automatizar":
> gatilhos, condições, ações, ramificação (branch), delay, retry,
> idempotência e histórico — como um domínio puro de simulação
> determinística, sem execução real de nenhuma ação. Consome `Installation`
> da Control Plane (`lib/control-plane/`) — nunca reimplementa
> `Tenant`/`DeploymentManifest`/`MODULE_CATALOG`. "Automation Engine" é
> nome interno de código; a tela voltada ao usuário final chama isso de
> "Automação" (`/app/settings/automacao`).

## Dois sistemas chamados automação

Este repositório tem DOIS sistemas de automação, em níveis de abstração
diferentes — nunca confundir:

| | `lib/automation/` (motor legado do CRM) | `lib/automation-engine/` (esta Foundation) |
|---|---|---|
| Nível | Execução REAL, por organização, dentro de UMA instalação | Modelagem de PLATAFORMA — o que uma instalação White Label da Brighter PODE automatizar |
| Disparo | `event_log` real (Postgres), trigger→worker | Simulação em memória, `WorkflowRun` nunca persistido de verdade |
| Ações | `crm_leads`/`contacts` reais, WhatsApp real (WAHA), webhook HTTP real | Adaptador fake/noop apenas — nenhuma ação real |
| Tabelas | `automation_rules`, `automation_rule_runs` (Postgres, RLS) | Nenhuma — `InMemoryWorkflowRepository` |
| Módulo do catálogo | `automation.webhooks`/`automation.followups` (`status: "stable"`) | Consome o MESMO catálogo pra entitlement — nunca reimplementa |
| Onde mora | `lib/automation/`, `app/api/v1/automation-rules/`, `app/app/webhooks/` | `lib/automation-engine/`, `app/app/settings/automacao/` |

`lib/automation-engine/` **nunca importa nem é importado por**
`lib/automation/*` — zero acoplamento nas duas direções. Todo tipo/função
exportado usa prefixo `Workflow`/`Automation`, nunca os mesmos nomes do
motor legado (`ActionExecutor`/`ActionCtx`/`RuleCondition`/etc.), mesmo sem
haver barrel compartilhado entre os dois.

## Objetivo

Antes desta fundação, "o que esta instalação pode automatizar" não tinha
representação própria de plataforma — só existia a execução real,
por-organização, do motor legado do CRM. Isso é suficiente pro produto,
mas insuficiente pra Brighter modelar/simular/documentar a CAPACIDADE de
automação de uma instalação (ramificação, delay, retry, idempotência) no
mesmo nível de abstração que Billing modela a capacidade financeira e
Monitoring modela a capacidade de saúde técnica. O Automation Engine
resolve isso permanecendo — como toda fundação anterior — uma camada de
domínio pura: sem execução real, sem agendamento real, sem persistência
real.

## Princípios (mesma doutrina das fundações anteriores)

- **Camada de domínio, não CRUD.** Tipos, catálogo, validação, planner,
  executor com adaptadores fake/noop, repositório in-memory, simulação,
  resumo — nunca uma API REST nova, nunca uma tabela, nunca uma Edge
  Function, nunca fila/cron/worker reais.
- **Consome `Installation` e `MODULE_CATALOG`, nunca duplica.**
  `validateWorkflowDefinition`/`generateAutomationSummary` recebem sempre
  o necessário derivado de `Installation`
  (`lib/control-plane/types.ts`)/`MODULE_CATALOG`
  (`lib/modules/catalog.ts`) — nunca reimplementam a noção de módulo
  habilitado ou plano permitido.
- **Módulo `status: "planned"` nunca é autorizado** (ex.:
  `automation.campaigns`), mesma regra de `resolveBillingEntitlements`
  (`lib/billing/entitlements.ts`) — o Automation Engine só pode NEGAR o
  que o Module Engine já decidiu, nunca CONCEDER além disso.
- **Delay/retry nunca usam `setTimeout`/cron real.** `nextAttemptAt` é só
  um carimbo ISO calculado deterministicamente; avançar o "relógio" é
  aritmética de `Date`, nunca espera de verdade — ver
  [`workflow-lifecycle.md`](workflow-lifecycle.md).
- **Idempotência de duas camadas:** de RUN (gatilho duplicado —
  `triggerFingerprint` determinístico, `planner.ts`) e de ETAPA (etapa
  `"completed"` nunca reexecuta — guard em `executor.ts`). NÃO é o
  `Idempotency-Key`/Upstash real da API (CLAUDE.md §"Idempotência & event
  sourcing leve") — é a MESMA ideia modelada no domínio, em memória, sem
  Redis.
- **Sem persistência real.** Só existe `InMemoryWorkflowRepository` — mesma
  doutrina das sete fundações anteriores.
- **Nenhuma dependência da Lumina.** Nenhum arquivo de
  `lib/automation-engine/*` lê, escreve ou referencia
  `/opt/brighter-lumina` (porta 8000).

## Arquitetura

```
lib/automation-engine/
  types.ts        — WorkflowDefinition/WorkflowRun/WorkflowActionStep/etc.
  catalog.ts        — WORKFLOW_TRIGGER_CATALOG + WORKFLOW_ACTION_CATALOG
  validation.ts       — validateWorkflowDefinition() (entitlement + estrutura + ciclo)
  planner.ts            — generateWorkflowRun() (idempotência de RUN)
  history.ts              — createWorkflowHistoryEntry() (sanitizado)
  executor.ts                — WorkflowActionAdapter + Noop/InMemory + executeWorkflowRun() (branch/delay/retry/idempotência de ETAPA)
  sanitization.ts               — reexporta sanitizeDeep (lib/tenants/export.ts) — nunca reimplementa
  repository.ts                    — WorkflowRepository + InMemoryWorkflowRepository + createDemoWorkflows()
  summary.ts                          — generateAutomationSummary()
  simulation.ts                          — simulateWorkflowRun() (8 cenários determinísticos)
  index.ts                                  — barrel público (export *)

app/app/settings/automacao/page.tsx   — tela admin-only, somente leitura
scripts/generate-automation-summary.ts — CLI (pnpm automation:summary)
```

Nenhum arquivo de `lib/automation-engine/*` lê `process.env` —
`sanitization.ts` importa `sanitizeDeep` de `@/lib/tenants/export`
diretamente (nunca o barrel `@/lib/tenants`, mesmo cuidado documentado em
`lib/billing/index.ts`/`lib/monitoring/index.ts`).

## Catálogo (`catalog.ts`)

`WORKFLOW_TRIGGER_CATALOG` (8 entradas: 5 eventos do CRM, 1 schedule de
follow-up, 1 webhook inbound, 1 schedule de campanha) e
`WORKFLOW_ACTION_CATALOG` (5 entradas, uma por ação do motor legado —
`add_tag`/`assign_owner`/`create_or_move_lead`/`call_webhook`/
`send_whatsapp_message` — `legacyActionType` documenta a correspondência
conceitual, nunca importada). `campaign_step_due` referencia
`automation.campaigns` (`status: "planned"`) de propósito — mesmo padrão
de `chatwoot_available`/`evolution_available` em
`lib/monitoring/catalog.ts`: fica no catálogo, mas
`validateWorkflowDefinition` nunca autoriza. Ver
[`action-catalog.md`](action-catalog.md).

## Workflow, run e execução

Ver [`workflow-lifecycle.md`](workflow-lifecycle.md) para o ciclo de vida
completo de `WorkflowRun`/`WorkflowStepRunState`, os 8 cenários de
`simulateWorkflowRun` e o mecanismo de branch/delay/retry/idempotência.

## Resumo (`summary.ts`)

`generateAutomationSummary(installation, workflows, runs)` — view model
JSON com contagem de workflows/runs por status e blockers de configuração
agregados (reusa `validateWorkflowDefinition` por workflow, nunca
reimplementa a checagem). `renderAutomationSummaryMarkdown` — mesmo estilo
Markdown das CLIs anteriores.

## Tela `/app/settings/automacao`

Server Component admin-only, mesmo guard de
`/app/settings/monitoramento`/`/app/settings/billing`
(`requireAuth()` + `resolveActiveOrg()` +
`ROLE_RANK[...] >= ROLE_RANK.admin` OU `is_platform_admin`, senão
`redirect("/403")`). Somente leitura — sem botão de execução real. Mostra:
instalação atual, estatísticas de workflows/runs, blockers de
configuração, tabela de workflows e tabela de runs recentes (cenário
`"all_success"` simulado na própria renderização). Usa o catálogo de
demonstração (`createDemoWorkflows`) — nesta Foundation não existe
workflow real persistido.

## CLI (`pnpm automation:summary`)

```bash
pnpm automation:summary -- --client "Empresa Exemplo" --slug empresa-exemplo \
  --domain crm.empresa.com.br --plan dedicated \
  --modules core.contacts,core.pipeline,channel.whatsapp,automation.webhooks \
  --scenario all_success --format markdown
```

Cenários aceitos: `all_success`, `webhook_retry_then_success`,
`webhook_retry_exhausted_fallback`, `fallback_action_also_fails`,
`duplicate_trigger_idempotent_skip`, `delayed_step_waiting`,
`workflow_inactive`, `module_not_authorized`. Sai com código != 0 quando o
run resultante termina `"failed"`.

## Relação com as fundações anteriores

```
White Label Runtime → Module Engine → Deployment Engine → Tenant Engine → Provisioning Engine → Control Plane
                                                                                                        ↓ licenciado/cobrado por
                                                                                                 Billing Engine
                                                                                                        ↓ automatizado por
                                                                                             Automation Engine
```

Nunca duplica: reusa o agregado `Installation` da Control Plane e o
`MODULE_CATALOG` do Module Engine. Ver mapa completo em
[`docs/architecture/brighter-platform.md`](../architecture/brighter-platform.md).

## Limitações da Foundation v1

- **Nenhuma execução real** — `executor.ts` só tem `NoopWorkflowActionAdapter`
  e `InMemoryWorkflowActionAdapter`; nenhum adaptador chama
  `lib/automation/actions/*`, WAHA, webhook HTTP real ou atualiza
  `crm_leads`/`contacts`.
- **Nenhum agendamento real** — delay/retry só calculam `nextAttemptAt`;
  não existe cron/worker/fila que "acorde" um run automaticamente. Quem
  avança o relógio nesta Foundation é sempre quem chama
  (teste/simulação/CLI).
- **Não persiste nada de verdade** — `InMemoryWorkflowRepository` vive só
  na memória do processo.
- **Idempotência simulada, não real** — sem Redis/Upstash; o dedupe é só
  em memória, contra os runs passados como `existingRuns`.
- **Um adaptador real** (que de fato chamasse `lib/automation/actions/*`)
  fica pra uma fase futura ("Automation Adapters Foundation", mesmo
  padrão da "Provisioning Adapters Foundation" — ver ROADMAP.md).

## Confirmação: esta versão não executa nada de verdade

Nenhum arquivo de `lib/automation-engine/*` chama rede, WhatsApp/WAHA,
webhook HTTP real, `setTimeout`/cron/worker/fila real, ou grava em
`crm_leads`/`contacts`/`automation_rules`. A tela e a CLI são puramente
leitura/simulação. Nenhuma peça deste engine acessa
`/opt/brighter-lumina` ou a porta 8000.
