---
type: reference
status: v1 — fundação
last_updated: 2026-08-04
---

# Handoff humano

> Complementa [`outreach-engine.md`](outreach-engine.md) e
> [`responses-and-ai.md`](responses-and-ai.md). `handoff.ts` NUNCA atribui
> um vendedor de verdade — só produz um `HumanHandoffDecision` (preview).
> Atribuição real fica pra uma fase futura com integração real ao CRM
> (`lib/leads`/`lib/agent-engine`).

## Motivos (`HumanHandoffReason`)

`interested` · `complex_question` · `objection` · `low_confidence` ·
`explicit_request` · `support_request` · `error` · `opt_out` ·
`high_priority`

## Derivação (`deriveHandoffReason`)

1. `decision.recommendHuman === false` → `null` (sem handoff).
2. `decision.confidence < 0.5` → `"low_confidence"` (confiança baixa
   SEMPRE recomenda humano, independente da classificação).
3. Senão, mapeia a classificação: `interested`/`meeting_request` →
   `"interested"`; `question` → `"complex_question"`; `objection` →
   `"objection"`; `support_request` → `"support_request"`; `opt_out` →
   `"opt_out"`; demais → `null`.

## `evaluateHumanHandoff(decision, ownerId?)`

Devolve `HumanHandoffDecision { shouldHandoff, reason, recommendedOwnerId?,
message }`. `opt_out` GERA um `HumanHandoffDecision` com `reason: "opt_out"`
mas `shouldHandoff` reflete a regra do catálogo
(`recommendsHandoff: false` pra `opt_out`) — nenhuma ação comercial é
recomendada sobre um opt-out, só o registro do motivo.

## `deriveRecommendedOwnerAction(decision)`

Texto curto em pt-BR pro vendedor humano, um por motivo — ex.: "Ligar/
responder o quanto antes — lead demonstrou interesse." pra `"interested"`,
"Nenhuma ação comercial — respeitar opt-out." pra `"opt_out"`.

## Nunca atribui vendedor real

`transferToOwnerPreview(decision, ownerId)` só anexa um `ownerId` sugerido
ao preview — nenhuma escrita em `crm_leads.owner_user_id` nem em qualquer
tabela real. A atribuição real de vendedor continua sendo responsabilidade
exclusiva do CRM (`lib/leads`), fora do escopo desta Foundation.
