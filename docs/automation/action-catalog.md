---
type: architecture
status: v1 — fundação
last_updated: 2026-08-04
---

# Catálogo de gatilhos e ações

> Complementa [`automation-engine.md`](automation-engine.md). Tabela
> completa de `WORKFLOW_TRIGGER_CATALOG`/`WORKFLOW_ACTION_CATALOG`
> (`lib/automation-engine/catalog.ts`).

## Gatilhos (`WORKFLOW_TRIGGER_CATALOG`)

| Id | Categoria | Módulo exigido | Planos |
|---|---|---|---|
| `lead.created` | event | `automation.webhooks` | lite, pro, dedicated |
| `lead.stage_changed` | event | `automation.webhooks` | lite, pro, dedicated |
| `lead.tag_added` | event | `automation.webhooks` | lite, pro, dedicated |
| `contact.tag_added` | event | `automation.webhooks` | lite, pro, dedicated |
| `message.received` | event | `automation.webhooks` | lite, pro, dedicated |
| `followup_window_elapsed` | schedule | `automation.followups` | lite, pro, dedicated |
| `inbound_webhook_received` | webhook | `automation.webhooks` | lite, pro, dedicated |
| `campaign_step_due` | schedule | `automation.campaigns` (**`status: "planned"` — nunca autorizado nesta Foundation**) | dedicated |

Os cinco primeiros correspondem conceitualmente aos `event_type` que o
motor legado (`lib/automation/engine.ts::EXPECTED_ENTITY_KIND`) já
processa — mesmos nomes, propósito documental, **nunca importado**.

## Ações (`WORKFLOW_ACTION_CATALOG`)

| Id | Categoria | Módulo exigido | Retry | Delay | `legacyActionType` |
|---|---|---|---|---|---|
| `add_tag` | crm | `core.contacts` | não | sim | `add_tag` |
| `assign_owner` | crm | `core.pipeline` | não | sim | `assign_owner` |
| `create_or_move_lead` | crm | `core.pipeline` | sim | sim | `create_or_move_lead` |
| `call_webhook` | integration | `automation.webhooks` | sim | sim | `call_webhook` |
| `send_whatsapp_message` | messaging | `channel.whatsapp` | sim | sim | `send_whatsapp_message` |

`legacyActionType` documenta a correspondência conceitual com o `type`
literal registrado em `lib/automation/actions/*.ts` (`registerAction({
type: "..." })`) — verificado por grep no momento em que este catálogo foi
escrito. **Nunca importado, nunca executado** — esta Foundation não chama
nenhuma dessas ações de verdade; um adaptador real fica pra uma fase
futura ("Automation Adapters Foundation", ver ROADMAP.md).

## Regras de `validateWorkflowDefinition`

- `retry` só é aceito numa etapa cuja ação tem `supportsRetry: true`
  (`add_tag`/`assign_owner` nunca aceitam retry no catálogo atual).
- `delaySeconds` só é aceito numa etapa cuja ação tem `supportsDelay: true`
  (todas as 5 ações do catálogo atual aceitam).
- Todo gatilho/ação com módulo `status: "planned"` no Module Engine
  (`campaign_step_due`/`automation.campaigns`) nunca é autorizado, mesmo
  se `enabledModuleIds` o contiver — mesma regra de
  `resolveBillingEntitlements`.
- `onSuccess`/`onFailure` precisam apontar pra um `id` de etapa existente
  no MESMO workflow — referência solta é erro de validação.
- O grafo formado por `onSuccess`/`onFailure` nunca pode ter ciclo — DFS
  com pilha de recursão (`detectCircularStepTransitions`), mesmo algoritmo
  de `detectCircularStepDependencies`
  (`lib/provisioning/validation.ts`), adaptado de `dependsOn` pras
  arestas de ramificação.
