---
type: reference
status: v1 — fundação
last_updated: 2026-08-06
---

# Plano de ativação (`lib/marketplace/activation.ts`)

`generateModuleActivationPlan()` produz um `ModuleActivationPlan` sempre
TEÓRICO — nesta Foundation **nunca**:

- ativa módulo real;
- edita `.env`;
- altera o Module Engine;
- faz deploy;
- reinicia serviço.

## Campos

| Campo | Conteúdo |
|---|---|
| `currentState`/`desiredState` | `enabled`/`disabled` atual vs. `activated`/`deactivated` desejado |
| `prerequisites` | módulos que precisam estar habilitados antes |
| `blockers`/`warnings` | herdados de `MarketplaceEligibilityResult` — plano bloqueado nunca esconde o motivo |
| `provisioningSteps` | passos legíveis (ex.: "Confirmar conexão WAHA ativa") derivados de `ModuleInfraRequirements` do Module Engine |
| `requiredEnvironmentVariables` | só NOMES (`ENABLED_MODULES`/`DISABLED_MODULES`), nunca valor real |
| `requiredBillingState` | `eligibility.billingRequirement`, ponteiro pro que falta financeiramente |
| `requiresRestart` | `true` se o módulo exige `worker`/`scheduler` |
| `requiresDeploy` | `true` se plano `dedicated` e módulo exige `whatsapp`/`edgeFunctions` |
| `reversible` | sempre `true` nesta Foundation — nenhuma infraestrutura real é criada, então nada precisa ser desfeito além do toggle de env var |
| `recommendation` | texto legível — "bloqueado — resolver N item(ns)" ou "pronto pra ativação" |

## Integração com Provisioning (`integrations.ts`)

`attachMarketplaceActivationToProvisioningPlan(provisioningPlan, activationPlans)`
produz um VIEW MODEL — nunca escreve num `ProvisioningPlan` real, nunca
chama `lib/provisioning/executor.ts`. Agrega múltiplos planos de ativação
(módulos a ativar, etapas adicionais, blockers, restart/deploy
recomendado, rollback teórico).

## Rollback teórico

Como nenhuma infraestrutura real é criada nesta Foundation, o "rollback" é
sempre: remover o módulo de `ENABLED_MODULES` / adicionar a
`DISABLED_MODULES`. Nunca um rollback de banco, storage ou DNS (isso é
escopo da Provisioning Engine, quando adaptadores reais existirem).
