---
type: reference
status: v1 — fundação
last_updated: 2026-08-04
---

# Ciclo de vida de campanha

> Complementa [`outreach-engine.md`](outreach-engine.md). Fonte única de
> verdade das transições: `lib/outreach/status.ts::CAMPAIGN_TRANSITIONS`.
> `lib/outreach/campaigns.ts` só consulta essa tabela — nunca reimplementa
> a checagem inline.

## Estados (`CampaignStatus`)

`draft` · `scheduled` · `active` · `paused` · `completed` · `cancelled` ·
`archived` · `blocked`

## Transições válidas

```
draft       → scheduled, cancelled, archived
scheduled   → active, cancelled, blocked, draft
active      → paused, completed, cancelled, blocked
paused      → active, cancelled, archived
completed   → archived
cancelled   → archived
blocked     → draft, cancelled, archived
archived    → (terminal)
```

`blocked` é alcançado quando `validateOutreachEntitlement`/
`evaluateChannelHealthForOutreach` reportam blocker (entitlement negado,
canal indisponível, limite de billing) — nunca definido pelo operador
diretamente.

## Funções (`campaigns.ts`)

`createCampaign` · `scheduleCampaign` · `activateCampaign` ·
`pauseCampaign` · `resumeCampaign` · `cancelCampaign` · `completeCampaign` ·
`archiveCampaign` · `blockCampaign`

Toda função de transição devolve `{ ok: true, campaign }` ou
`{ ok: false, error: OutreachValidationError }` — nunca lança. Transição
inválida é reportada como erro estruturado (`field: "status"`), nunca
mensagem genérica solta.

## Nunca dispara envio real

Nenhuma transição de campanha, por si só, enfileira ou envia mensagem —
isso é sempre uma simulação explícita via `simulateOutreachScenario`
(`simulation.ts`) ou, numa fase futura, o "Outreach Runtime real".
