---
type: reference
status: v1 — fundação
last_updated: 2026-08-04
---

# Cadências e enrollments

> Complementa [`outreach-engine.md`](outreach-engine.md). Uma `OutreachCadence`
> é um grafo de `OutreachCadenceStep` (`message`/`email`/`delay`/
> `condition`/`wait_for_reply`/`assign_owner`/`create_task`/
> `update_pipeline`/`transfer_to_human`/`end`); um `OutreachEnrollment` é o
> estado de UM contato progredindo nesse grafo.

## Grafo de etapas (`cadences.ts`)

- `orderCadenceSteps(cadence)` — etapas ordenadas por `order` (nunca pela
  ordem de inserção no array).
- `resolveNextCadenceStep(cadence, currentStepId?)` — segue
  `onSuccess[0]` se existir; senão cai pra próxima etapa por `order`; senão
  `null` (fim da cadência). Ausência de `currentStepId` = primeira etapa.
- `calculateNextStepAt(now, delaySeconds)` — ISO-8601 UTC, `now + delaySeconds`.
  Nunca `setTimeout` real; quem chama de novo mais tarde é quem "avança o
  relógio" (mesmo padrão de `executeWorkflowRun` no Automation Engine).
- `stopCadenceOnReply(cadence)` — `cadence.stopOnReply`.
- `stopCadenceOnOptOut(_cadence)` — sempre `true`: opt-out tem SEMPRE
  precedência, independente da configuração da cadência.
- Ciclos são rejeitados por `validateCadence` (`validation.ts`), via
  `detectCircularCadenceSteps` — mesmo algoritmo DFS de
  `detectCircularStepTransitions` no Automation Engine, redeclarado porque
  opera sobre `onSuccess`/`onFailure` como ARRAY (não escalar).

## Ciclo de vida de enrollment (`EnrollmentStatus`)

`pending` · `scheduled` · `active` · `waiting` · `responded` ·
`qualified` · `transferred` · `completed` · `cancelled` · `opted_out` ·
`blocked` · `failed`

```
pending     → scheduled, active, cancelled, blocked, opted_out, failed
scheduled   → active, cancelled, blocked, opted_out, failed
active      → waiting, responded, completed, cancelled, opted_out, blocked, failed
waiting     → active, responded, completed, cancelled, opted_out, blocked, failed
responded   → qualified, transferred, active, completed, cancelled, opted_out
qualified   → transferred, completed, cancelled
transferred → completed, cancelled
completed / cancelled / opted_out / blocked / failed → (terminal)
```

`pending → active` é direto — `scheduled` é um estado intermediário
OPCIONAL, nunca obrigatório (`activateEnrollment` normalmente chama logo
após `createEnrollment`).

## Funções (`enrollments.ts`)

`createEnrollment` · `activateEnrollment` · `advanceEnrollment` ·
`markEnrollmentResponded` · `qualifyEnrollment` ·
`transferEnrollmentToHuman` · `failEnrollment` · `optOutEnrollment` ·
`cancelEnrollment` (reusa `cancelCadenceEnrollment`) · `completeEnrollment`
(reusa `completeCadenceEnrollment`).

### Idempotência

`idempotencyKey` = `` `${campaignId}:${contactId}` `` — conferida contra os
enrollments já existentes ANTES de criar um novo (`createEnrollment`
rejeita duplicata com erro estruturado). Mesma ideia do
`unique(organization_id, external_id)`/`Idempotency-Key` reais (CLAUDE.md
§"Idempotência & event sourcing leve"), modelada em memória — não é Redis/
Upstash real.

### Opt-out sempre bloqueia criação

`createEnrollment` rejeita QUALQUER contato com `isBlocked: true` antes de
checar qualquer outra regra — nunca contornável, nunca uma etapa posterior
"desfaz" isso.

### `advanceEnrollment` nunca reexecuta etapa concluída

Avança pra `resolveNextCadenceStep`; sem próxima etapa, chama
`completeCadenceEnrollment` automaticamente — mesmo espírito de
idempotência de etapa do Automation Engine (`executeWorkflowRun`).
