---
type: reference
status: v1 — fundação
last_updated: 2026-08-06
---

# Licenças (`lib/marketplace/licenses.ts`)

`ModuleLicense` = o direito comercial de UM tenant usar UM módulo. Nunca
altera `ENABLED_MODULES`/`DISABLED_MODULES` — só o Module Engine decide
tecnicamente; a licença é o eixo COMERCIAL.

## `LicenseStatus` — transições (`status.ts::LICENSE_TRANSITIONS`)

```
draft ──► trial ──► active ⇄ grace_period
  │         │          │           │
  │         └────────► expired ◄───┘
  │                       │
  └──────────────────► cancelled (terminal)
            active ──► suspended ⇄ grace_period
            active ──► revoked (terminal)
            expired ──► active (renovação)
```

`cancelled`/`revoked` são terminais — nenhuma transição sai deles.
Transição inválida lança `MarketplaceInvalidTransitionError`.

| Função | Efeito |
|---|---|
| `createLicense()` | nasce `draft`, nunca ativa módulo real |
| `activateLicense()` | → `active` |
| `suspendLicense()` | → `suspended`. **Nunca remove dado.** |
| `startLicenseGracePeriod(endsAt)` | → `grace_period`, grava `gracePeriodEndsAt` |
| `expireLicense()` | → `expired`, grava `endsAt` |
| `cancelLicense()` | → `cancelled` (terminal) |
| `revokeLicense()` | → `revoked` (terminal) |
| `renewLicense(newEndsAt?)` | volta pra `active` a partir de `expired`/`grace_period`/`suspended` |
| `changeLicenseVersion(v)` | só troca `version`, nunca o status |
| `convertTrialToLicense(trial, licenseId)` | `ModuleTrial` `active` → `ModuleLicense` `active`, `source: "trial"` |

## `LicenseSource`

`included_in_plan` · `paid_addon` (referencia `billingSubscriptionId`/
`billingItemId`) · `trial` · `manual_grant` · `internal` · `bundle`
(referencia `bundleId`).

## Regras não-negociáveis

- Licença suspensa/expirada **nunca remove dado** — módulos `core.*`
  permanecem acessíveis em modo restrito (ver [`entitlements.md`](entitlements.md)).
- Módulo incompatível nunca ativa, mesmo com licença ativa — a checagem
  técnica do Module Engine sempre vence (ver `eligibility.ts`).
- Módulo `planned` nunca ativa em produção, mesmo com licença ativa.
- Licença não gera efeito colateral — apenas dados em memória; quem decide
  "ativar de verdade" é sempre um adaptador (`adapters.ts`, sempre
  Noop/Fake nesta Foundation).
