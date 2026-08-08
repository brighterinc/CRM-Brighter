---
type: reference
status: v1 — fundação
last_updated: 2026-08-06
---

# Elegibilidade e entitlement

Duas perguntas DIFERENTES, duas funções DIFERENTES:

| | `eligibility.ts::evaluateModuleEligibility` | `entitlements.ts::resolveMarketplaceEntitlements` |
|---|---|---|
| Pergunta | "este tenant PODERIA licenciar este módulo?" (prospectivo) | "este tenant TEM DIREITO a este módulo AGORA?" (estado atual) |
| Entrada | 1 módulo por vez, `billing`/`monitoring` já resolvidos | catálogo inteiro + licenças/trials reais do tenant |
| Considera licença/trial existente? | Não — resposta genérica de compatibilidade | Sim — é o que decide o resultado |
| Usado por | tela de "comprar"/"iniciar trial" (recomendação) | tela de "o que está autorizado agora" (`/app/settings/modulos-licencas`) |

## `evaluateModuleEligibility`

Consolida (nunca redecide):

1. **Module Engine tem precedência técnica** — módulo `planned` nunca
   elegível em produção (`recommendedAction: "wait_for_module_release"`).
2. Status comercial `retired`/`disabled` bloqueia; `deprecated` só avisa.
3. **Plano incompatível bloqueia** (`recommendedAction: "upgrade_plan"`).
4. **Dependência comercial ausente bloqueia**
   (`recommendedAction: "resolve_dependency"`).
5. Módulo desligado tecnicamente (`DISABLED_MODULES`/dependência/plano)
   bloqueia.
6. **Incompatibilidade com módulo já licenciado bloqueia** — licença ativa
   NUNCA supera incompatibilidade técnica
   (`recommendedAction: "remove_conflicting_module"`).
7. **Billing tem precedência financeira** — só pode NEGAR.
8. **Monitoring só gera warning/bloqueio OPERACIONAL, nunca financeiro** —
   mesma separação estrutural documentada em
   `docs/billing/billing-engine.md` §"Separação Billing x Monitoring".

Retorna `{ eligible, blockers, warnings, requiredPlan, requiredModules,
incompatibleModules, billingRequirement, trialAvailable, recommendedAction }`.

## `resolveMarketplaceEntitlements`

Combina Module Engine (`installation.enabledModules`), licenças, trials e
`billingAuthorizedModuleIds` (já resolvido por `resolveBillingEntitlements`
— este arquivo nunca importa `lib/billing/*` diretamente).

Ordem de checagem por módulo (cada uma pode NEGAR a anterior, nunca
conceder além dela):

1. `planned`/`retired`/`disabled` comercialmente → nega.
2. Não habilitado tecnicamente (Module Engine) → nega — **DISABLED_MODULES
   sempre prevalece**, mesmo com licença ativa.
3. **Trial bypassa Billing** — trial ativo, ou licença com
   `source: "trial"` `active`/`grace_period`, autoriza sem checar Billing.
4. Billing não autorizou → nega, exceto `core.*` (modo restrito).
5. Sem licença → `core.*` incluído por padrão; não-core nega
   (`not_licensed`).
6. Com licença: `active`/`grace_period` autoriza; `suspended`/`expired`
   nega não-core mas mantém `core.*` restrito; `cancelled`/`revoked` nega
   sempre.

Retorna `MarketplaceEntitlementsResult` com `authorizedModules`,
`deniedModules`, `trialModules`, `expiredModules`, `suspendedModules`,
`includedModules`, `addonModules`, `privateModules`, `warnings`, `blockers`,
`reasons`.

## Regra central

**O Marketplace nunca concede além do Module Engine, e nunca concede além
do Billing.** Ele só pode ser mais restritivo — nunca mais permissivo — que
qualquer uma das duas fundações precedentes.
