---
type: architecture
status: v1 — fundação
last_updated: 2026-08-03
---

# Ciclo de vida de uma `BillingSubscription`

> Complementa [`billing-engine.md`](billing-engine.md). Toda transição
> passa por `assertValidSubscriptionTransition` (`lib/billing/status.ts`) —
> nenhuma decisão implícita dentro de `subscriptions.ts`.

## Estados (`SubscriptionStatus`)

| Estado | Significado |
|---|---|
| `draft` | Assinatura criada, ainda não ativada — nenhuma cobrança nem trial em curso. |
| `trial` | Período de avaliação gratuito (`trialDays` em `createSubscription`). |
| `active` | Assinatura em dia, período corrente vigente. |
| `past_due` | Pagamento do período corrente falhou ou está atrasado. |
| `grace_period` | Janela de tolerância (`gracePeriodDays` do plano) antes de recomendar suspensão. |
| `suspended` | Grace period expirou sem regularização — recomendação de suspensão, nunca execução real. |
| `cancelled` | Terminal — assinatura encerrada (imediata ou ao fim do período). |
| `expired` | Terminal — trial encerrado sem conversão. |

## Transições permitidas (`SUBSCRIPTION_TRANSITIONS`)

```
draft        → trial, active, cancelled
trial        → active, past_due, cancelled, expired
active       → past_due, grace_period, suspended, cancelled
past_due     → active, grace_period, cancelled
grace_period → active, suspended, cancelled
suspended    → active, cancelled
cancelled    → (terminal)
expired      → (terminal)
```

Transição fora dessa tabela lança `InvalidSubscriptionTransitionError` —
nunca um estado "por acidente".

## Funções (`subscriptions.ts`) e o que cada uma faz

- **`createSubscription(input, now)`** — nasce `draft` (sem `trialDays`) ou
  `trial` (`trialDays > 0`). Valida plano/ciclo (`validateBillingSubscriptionInput`)
  antes de existir.
- **`activateSubscription(sub, now)`** — `draft`/`trial` → `active`,
  reinicia o período a partir de `now`.
- **`renewSubscription(sub, now)`** — avança pro próximo período
  (`addCycleDuration`). Se `cancelAtPeriodEnd`, completa o cancelamento
  aqui (nunca antes do fim do período pago). Se houver `pendingPlanChange`
  cujo `effectiveAt` já chegou, aplica o downgrade agendado.
- **`changeSubscriptionPlan(sub, toPlanId, toCycle, now)`** — **upgrade é
  sempre imediato**; **downgrade é sempre agendado** pro fim do período
  atual (delega a `scheduleDowngrade`). Combinação fora do catálogo
  (`BILLING_PLAN_CATALOG[...].upgradeTo`/`.downgradeTo`) lança
  `BillingPlanChangeNotAllowedError`.
- **`scheduleDowngrade(sub, toPlanId, toCycle, now)`** — grava
  `pendingPlanChange = { planId, cycle, effectiveAt: currentPeriodEnd }`.
  O plano atual NÃO muda até `renewSubscription` processar.
- **`cancelSubscription(sub, now, { immediate })`** — `immediate: true`
  cancela agora; senão só marca `cancelAtPeriodEnd: true` (completa em
  `renewSubscription`).
- **`markSubscriptionPastDue(sub, now)`** — `active` → `past_due`.
- **`suspendSubscription(sub, now)`** — atalho administrativo direto pra
  `suspended`. Prefira `startGracePeriod` → `expireGracePeriod` pro fluxo
  normal de inadimplência.
- **`startGracePeriod(sub, now, gracePeriodDays?)`** — usa o
  `gracePeriodDays` do próprio plano comercial quando não informado.
- **`expireGracePeriod(sub, now)`** — lança `GracePeriodNotElapsedError` se
  `now` ainda for anterior a `gracePeriodEndsAt`; senão `suspended`.
- **`reactivateSubscription(sub, now)`** — `suspended` → `active`, limpa
  `gracePeriodEndsAt`.

## Fluxo típico de inadimplência

```
active --(pagamento falha)--> past_due --(startGracePeriod)--> grace_period
  --(expireGracePeriod, now >= gracePeriodEndsAt)--> suspended
  --(reactivateSubscription, após regularização)--> active
```

Em nenhum ponto desse fluxo qualquer dado do tenant é removido — ver
[`entitlements-and-limits.md`](entitlements-and-limits.md) §"assinatura
suspensa nunca remove dado".

## Datas sempre determinísticas

Nenhuma função de `subscriptions.ts` lê `Date.now()` internamente — `now`
é sempre recebido por parâmetro. `addCycleDuration`/`addDaysIso` são puras
e determinísticas (mesma entrada → mesma saída), o que permite
`simulateBillingScenario` (`simulation.ts`) e os testes
(`tests/unit/billing-subscriptions.test.ts`) serem 100% reproduzíveis.
