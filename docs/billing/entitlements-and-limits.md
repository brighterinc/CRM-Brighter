---
type: architecture
status: v1 — fundação
last_updated: 2026-08-03
---

# Entitlements de módulo e limites de consumo

> Complementa [`billing-engine.md`](billing-engine.md). Responde "este
> módulo está autorizado pra esta instalação, considerando plano
> COMERCIAL + assinatura + o que o Module Engine já resolveu
> tecnicamente?" — sem NUNCA ligar/desligar nada de verdade.

## Precedência — Billing só NEGA, nunca CONCEDE

`resolveBillingEntitlements` (`lib/billing/entitlements.ts`) avalia cada
módulo do catálogo (`MODULE_CATALOG`, `lib/modules/catalog.ts`) nesta
ordem, e a primeira regra que se aplica decide:

1. **`status: "planned"`** → nunca autorizado em produção, independente de
   plano comercial ou assinatura.
2. **Fora de `allowedPlans` do `deploymentPlan`** → nunca autorizado (ex.:
   `channel.whatsapp` nunca autorizado num plano comercial cujo
   `deploymentPlan` é `lite`/`pro`).
3. **Comercialmente incluído** (`includedModules`) → autorizado,
   `source: "included"`.
4. **Extra pago contratado** (`optionalModules` + item `type: "module"` na
   assinatura com o mesmo `referenceId`) → autorizado,
   `source: "optional_extra_purchased"`.
5. **Extra pago NÃO contratado** → não autorizado,
   `source: "optional_extra_not_purchased"`.
6. **Fora do plano comercial** (nem incluído nem opcional) → não
   autorizado, `source: "not_in_commercial_plan"`.
7. **`DISABLED_MODULES`/dependência/plano já bloquearam tecnicamente**
   (`installation.modules` não contém o id) → não autorizado,
   `source: "blocked_by_module_engine"` — **mesmo que os passos 3-6 acima
   tivessem autorizado comercialmente**. O Module Engine sempre vence.
8. **Assinatura suspensa/cancelada/expirada** → módulos não-core perdem
   autorização (`source: "blocked_by_subscription_status"`); módulos
   `core.*` permanecem autorizados em modo **restrito**
   (`source: "restricted_core_during_suspension"`, `restricted: true`).

## Assinatura suspensa nunca remove dado

Esta é a regra mais importante do módulo: **nenhuma função de
`entitlements.ts`/`subscriptions.ts` apaga registro, desliga módulo de
verdade ou executa suspensão real de instalação.** `resolveBillingEntitlements`
só produz um `ModuleEntitlement[]` (dado, não ação) e
`recommendInstallationAction` (`status.ts`) só produz uma string de
recomendação (`"keep_active" | "warn" | "grace_period" | "suspend_recommended"`).
Módulos `core.*` (prefixo `core.` no id) continuam acessíveis mesmo com
assinatura suspensa — política deliberada pra o cliente nunca perder
acesso de leitura aos próprios dados enquanto a situação financeira é
regularizada.

## Limites (`BillingLimits`) — ausência é "ilimitado", nunca zero

```ts
type BillingLimits = {
  users?: number; contacts?: number; storageMb?: number;
  messagesPerMonth?: number; campaignsPerMonth?: number;
  aiActionsPerMonth?: number; activeModules?: number;
  whatsappConnections?: number;
};
```

Uma chave AUSENTE em `BillingLimits` significa "ilimitado/não controlado
nesta Foundation" — nunca inferida como zero. O plano Dedicated do
catálogo de demonstração não define nenhum limite (`{}`) por esse motivo.

## Consumo (`usage.ts`) — nunca bloqueia, só recomenda

- **`evaluateUsageAgainstLimits(usage, limits)`** — pra cada métrica com
  limite definido, calcula `percentage` (`calculateUsagePercentage`) e
  classifica: `unlimited` (sem limite), `ok` (< 80%), `warning` (≥ 80%),
  `exceeded` (≥ 100%).
- **`deriveUsageWarnings`/`deriveUsageBlockers`** — só produzem strings de
  alerta. Nenhuma delas impede uma ação real — "blocker" aqui é um alerta
  forte, não um bloqueio técnico.
- **`suggestPlanUpgrade(planId, evaluations)`** — só sugere (nunca decide
  sozinho) o próximo plano de `BILLING_PLAN_CATALOG[...].upgradeTo` quando
  alguma métrica excedeu. Plano sem upgrade disponível (Dedicated) nunca
  sugere nada.
- **Toda simulação é determinística** — `usage.metrics` é sempre um dado
  de ENTRADA (real no futuro, sintético/gerado por
  `simulateBillingScenario` nesta Foundation), nunca inferido por
  dedução.

## Ver também

- [`billing-engine.md`](billing-engine.md) §"Catálogo comercial" — onde
  `includedModules`/`optionalModules` são definidos por plano.
- [`docs/modules/module-engine.md`](../modules/module-engine.md) — fonte
  da verdade sobre `allowedPlans`/`status`/`DISABLED_MODULES`.
