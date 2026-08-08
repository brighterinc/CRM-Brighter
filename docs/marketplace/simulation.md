---
type: reference
status: v1 — fundação
last_updated: 2026-08-06
---

# Simulação (`lib/marketplace/simulation.ts`)

`simulateMarketplaceScenario(scenario, opts?)` é o dry-run determinístico —
nunca ativa módulo real, nunca cobra, nunca persiste. Parte sempre da
instalação de demonstração **Dedicated** (`createDemoInstallations().find(i
=> i.deploymentPlan === "dedicated")`) — é o único plano em que
`channel.whatsapp` é tecnicamente permitido, evitando que cenários
"saudáveis" nasçam com blocker de plano por acidente.

## Os 26 cenários

| Cenário | O que demonstra |
|---|---|
| `included-module` | módulo `core.*` incluído por padrão, sem licença |
| `paid-addon` | módulo comprado via Billing, licença `active` |
| `active-license` | licença `active` autoriza |
| `suspended-license` | licença `suspended` nega módulo não-core |
| `expired-license` | licença `expired` nega módulo não-core |
| `cancelled-license` | licença `cancelled` nega sempre |
| `active-trial` | trial `active` autoriza — bypassa Billing |
| `expired-trial` | trial expirado sem conversão → cai pro gate normal de Billing |
| `trial-converted` | `convertTrialToLicense` — licença `source: "trial"` `active` |
| `incompatible-plan` | plano `lite` nunca autoriza `channel.whatsapp` |
| `missing-dependency` | dependência comercial ausente (`core.contacts` removido) bloqueia |
| `conflicting-module` | módulo incompatível com um já licenciado bloqueia |
| `module-planned` | módulo técnico `planned` nunca elegível em produção |
| `module-deprecated` | módulo comercial `deprecated` — warning, não blocker |
| `module-retired` | módulo comercial `retired` nunca aceita nova licença |
| `module-disabled` | módulo comercialmente desabilitado |
| `billing-denied` | comprado mas assinatura `suspended` → `blocked_by_subscription_status` |
| `billing-active` | comprado e assinatura `active` → autorizado |
| `private-offer` | oferta privada bloqueia tenant fora de `eligibleTenantIds` |
| `bundle-valid` | bundle de demonstração sem conflito |
| `bundle-conflict` | bundle com módulo incompatível consigo mesmo |
| `version-upgrade` | `planVersionUpgrade` sem blocker |
| `version-downgrade` | `planVersionDowngrade` sem blocker |
| `grace-period` | licença `grace_period` ainda autoriza |
| `activation-ready` | `generateModuleActivationPlan` sem blocker |
| `activation-blocked` | `generateModuleActivationPlan` herda blockers de elegibilidade |

## Regra de isolamento de cenário

Cenários focados numa regra específica (ex.: `conflicting-module`,
`module-deprecated`, `private-offer`) compram o módulo via
`purchasedModuleIds` pra isolar o blocker relevante do blocker genérico "não
comprado" — senão todo cenário mostraria dois blockers misturados e a
demonstração perderia clareza. Cenários de trial (`active-trial`/
`expired-trial`/`trial-converted`) pulam a checagem de Billing na
elegibilidade porque trial nunca passa por Billing (ver
[`entitlements.md`](entitlements.md)).

## CLI (`pnpm marketplace:summary`)

```bash
pnpm marketplace:summary -- --client "Empresa Exemplo" --slug empresa-exemplo \
  --domain crm.empresa.com.br --plan dedicated \
  --modules core.contacts,channel.whatsapp,ai.agents \
  --scenario paid-addon --format markdown
```

Sai com código != 0 quando o cenário é um dos "cenários críticos" e a
simulação reportou blocker de fato (`CRITICAL_SCENARIOS` no CLI) — mesma
regra de `generate-outreach-summary.ts`/`generate-billing-summary.ts`.
