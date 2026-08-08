---
type: reference
status: v1 — fundação
last_updated: 2026-08-06
---

# Trials (`lib/marketplace/trials.ts`)

`ModuleTrial` = período de teste comercial de um módulo, por tenant. Datas
SEMPRE recebidas por parâmetro (nunca `Date.now()` interno) — quem chama
controla o relógio, mesma doutrina de delay/retry do Automation Engine.
**Nunca executa cobrança.**

## `TrialStatus` — transições (`status.ts::TRIAL_TRANSITIONS`)

```
scheduled ──► active ──┬──► expired    (terminal)
    │                  ├──► converted  (terminal)
    │                  └──► cancelled  (terminal)
    └──────────────────────► cancelled (terminal)
```

Todos os estados de destino são terminais — um trial nunca reabre.

| Função | Efeito |
|---|---|
| `createTrial(input, marketplaceModule)` | recusa se `!trialAvailable` (`TrialNotAvailableError`); recusa se módulo `status: "retired"` |
| `startTrial()` | `scheduled → active` |
| `expireTrial()` | `→ expired`. **Nunca remove dado.** |
| `cancelTrial()` | `→ cancelled` |
| `convertTrial(convertedLicenseId)` | `→ converted`; usar `licenses.ts::convertTrialToLicense` pra gerar a licença correspondente |
| `hasActiveTrial(trials, tenantId, moduleId)` | true se existe trial `scheduled`/`active` — política padrão de "um trial por tenant/módulo" |

## Regras

- Trial único por tenant/módulo, salvo política explícita futura
  (`hasActiveTrial` é o ponto de checagem).
- Não permite trial de módulo sem `trialAvailable: true`.
- Não permite trial de módulo `retired`.
- Trial expirado não remove dado.
- Trial convertido não pode converter novamente (transição bloqueada por
  `status.ts`).
- **Trial nunca passa pelo Billing.** Um trial ativo — ou uma licença
  nascida de `convertTrialToLicense` (`source: "trial"`) — autoriza
  independente do gate financeiro (ver [`entitlements.md`](entitlements.md)
  §"Trial bypassa Billing"). Só a checagem técnica (Module Engine) pode
  negar um trial.
