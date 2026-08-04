---
type: architecture
status: v1 — fundação
last_updated: 2026-08-04
---

# Ciclo de vida de um `WorkflowRun`

> Complementa [`automation-engine.md`](automation-engine.md). Detalha os
> estados de `WorkflowRun`/`WorkflowStepRunState`
> (`lib/automation-engine/types.ts`) e como `planner.ts`/`executor.ts`
> transitam entre eles.

## `WorkflowRunStatus`

| Status | Significado | Quem decide |
|---|---|---|
| `queued` | Run criado, nenhuma etapa rodou ainda | `generateWorkflowRun` (planner) |
| `running` | Executor está processando (estado transitório dentro de UMA chamada de `executeWorkflowRun`) | `executor.ts` |
| `waiting` | Parou numa etapa em delay ou aguardando retry — `currentStepId` aponta pra ela | `executor.ts` |
| `completed` | Chegou ao fim de um ramo via `onSuccess`/sem próxima etapa, sem falha não tratada | `executor.ts` |
| `failed` | Validação falhou no planner, OU o grafo terminou numa etapa `failed` sem `onFailure` | `planner.ts` ou `executor.ts` |
| `cancelled` | Workflow não estava `"active"` no momento do gatilho | `planner.ts` |
| `skipped_duplicate` | `triggerFingerprint` já tinha um run `queued`/`running`/`waiting`/`completed` — idempotência de RUN | `planner.ts` |

`queued`/`running`/`waiting` nunca são terminais — `executeWorkflowRun`
sempre pode ser chamado de novo sobre eles. `completed`/`failed`/
`cancelled`/`skipped_duplicate` SÃO terminais: uma nova chamada de
`executeWorkflowRun` sobre um run terminal é um no-op (devolve o run
inalterado, sem processar nenhuma etapa — ver guard `TERMINAL_RUN_STATUSES`
no topo de `executor.ts`).

## `WorkflowStepStatus`

| Status | Significado |
|---|---|
| `pending` | Ainda não é a vez desta etapa (fora do caminho já percorrido) |
| `ready` | É a etapa de entrada (`entryStepId`) — única que nasce assim |
| `waiting_delay` | `delaySeconds` configurado, aplicado, aguardando `nextAttemptAt` |
| `running` | Sendo processada NESTA chamada de `executeWorkflowRun` |
| `retrying` | Falhou, `retry` configurado, tentativas restantes — aguardando `nextAttemptAt` |
| `completed` | Sucesso — NUNCA reexecuta (idempotência de etapa) |
| `failed` | Falha final (sem retry, ou retry esgotado) |
| `skipped` | Adaptador devolveu `"skipped"` — segue pelo mesmo ramo de `onSuccess` |
| `cancelled` | Reservado — não usado nesta Foundation v1 (run inteiro cancela via `WorkflowRunStatus`, nunca etapa individual) |

## Como o executor caminha o grafo

Diferente do `ProvisioningPlan` (grafo `dependsOn` executado em lote, todas
as etapas elegíveis de uma vez): um `WorkflowRun` tem ramificação
(`onSuccess`/`onFailure`), então **só existe um caminho ativo por vez**.
`executeWorkflowRun` mantém `currentStepId` e avança:

1. Etapa já `"completed"` → erro `run.step_already_completed`, run vira
   `"failed"` (idempotência de etapa violada nunca deveria acontecer em
   uso normal — é um guard de segurança).
2. `delaySeconds` configurado e ainda não aplicado → etapa vira
   `"waiting_delay"`, `nextAttemptAt` calculado, run pára aqui
   (`"waiting"`). NUNCA `setTimeout` real.
3. `"waiting_delay"`/`"retrying"` com `nextAttemptAt` no futuro (relativo
   ao `now` passado pelo chamador) → pára aqui de novo, sem executar nada.
4. Senão, roda de fato: chama `adapter.execute(actionId, ctx, config)`.
   - `"success"`/`"skipped"` → etapa conclui, `currentStepId = onSuccess`.
   - `"failed"` com `retry` e tentativas restantes → etapa vira
     `"retrying"`, `nextAttemptAt` calculado com `backoffSeconds`, run
     pára (`"waiting"`).
   - `"failed"` sem retry ou esgotado → etapa vira `"failed"`,
     `currentStepId = onFailure`.
5. Quando `currentStepId` fica `undefined` (nem `onSuccess` nem
   `onFailure` definido pra última etapa tocada), o run assenta em
   `"completed"` ou `"failed"` — decidido no EXATO ponto da transição
   (`finalOutcome`), nunca por uma varredura pós-laço que poderia
   confundir etapas de ramos diferentes.

**Avançar o relógio é responsabilidade de quem chama.** Nesta Foundation,
ninguém "acorda" um run `"waiting"` sozinho — `simulation.ts`'s
`resolveUntilSettled` é o único lugar que chama `executeWorkflowRun`
repetidamente, avançando `now` pro `nextAttemptAt` já calculado, até o run
sair de `queued`/`running`/`waiting` (ou bater um teto de segurança de 20
chamadas).

## Os 8 cenários de `simulateWorkflowRun`

| Cenário | O que prova |
|---|---|
| `all_success` | Caminho feliz completo — tag → webhook → confirmação (delay resolvido) → `completed` |
| `webhook_retry_then_success` | Falha 2x, sucede na 3ª tentativa (dentro de `maxAttempts`) → segue `onSuccess` |
| `webhook_retry_exhausted_fallback` | Esgota `maxAttempts`, cai no `onFailure` (fallback), fallback sucede → `completed` |
| `fallback_action_also_fails` | Esgota retry, fallback TAMBÉM falha, fallback não tem `onFailure` → `failed` |
| `duplicate_trigger_idempotent_skip` | Mesmo `workflowId` + mesmo `triggerPayload` duas vezes → segundo run `skipped_duplicate` |
| `delayed_step_waiting` | UMA chamada só (sem `resolveUntilSettled`) — pára em `waiting_delay`, prova que não há sleep real |
| `workflow_inactive` | `workflow.status !== "active"` → `cancelled` sem tocar nenhuma etapa |
| `module_not_authorized` | Módulo exigido por uma ação não habilitado → `failed` na validação do planner, antes de qualquer etapa rodar |

Todos determinísticos — nenhum usa `Math.random`, `Date.now()` implícito
dentro do laço, ou I/O real.
