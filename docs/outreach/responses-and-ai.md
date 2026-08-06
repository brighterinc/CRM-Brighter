---
type: reference
status: v1 — fundação
last_updated: 2026-08-04
---

# Respostas e IA opcional

> Complementa [`outreach-engine.md`](outreach-engine.md). **IA aqui é uma
> capacidade OPCIONAL consumida pela Outreach Engine e por outros módulos
> específicos (atendimento, comercial, classificação de resposta, resumo
> de conversa, recomendação de próxima ação) — não existe "AI Engine"
> independente nesta plataforma.** Ver
> [`docs/architecture/brighter-platform.md`](../architecture/brighter-platform.md).

## Classificação (`ResponseClassification`)

`interested` · `not_interested` · `question` · `objection` ·
`meeting_request` · `support_request` · `opt_out` · `wrong_contact` ·
`spam` · `unknown` — catálogo completo com `stopsCadence`/
`recommendsHandoff` em `catalog.ts::OUTREACH_RESPONSE_CLASSIFICATION_CATALOG`.

## Adaptadores (`adapters.ts`)

`ResponseClassifier { classify(bodySanitized): Promise<AIResponseDecision> }`
e `ResponseDraftGenerator { draft(bodySanitized, contactFirstName?):
Promise<ResponseDraftResult> }` — só duas implementações cada, nesta
Foundation:

- `NoopResponseClassifier`/`NoopResponseDraftGenerator` — sempre
  `"unknown"`/`recommendHuman: true` ou `{ ok: false, reason:
  "no_capability" }`. Nenhuma chamada real.
- `FakeResponseClassifier` — classificação determinística por PALAVRA-CHAVE
  (regex fixa, nunca `Math.random`, nunca modelo real). Detecta STOP/PARAR/
  SAIR/UNSUBSCRIBE → `opt_out` (confiança 0.99), mas **NUNCA decide opt-out
  sozinha** — a decisão final de bloqueio continua sendo
  `contacts.is_blocked` (`consent.ts`); este classificador só SUGERE.
- `FakeResponseDraftGenerator` — rascunho fixo, nunca enviado
  automaticamente.

A FORMA dessas interfaces espelha (nunca importa) as interfaces reais de
`lib/agent-engine/agent/intent-classifier.ts` (`IntentVerdict { intentName,
confidence }`) e `draft-reply.ts` (`DraftReplyResult`) — aquelas exigem
DB/LLM reais (`ClassifyIntentDeps`), incompatíveis com um engine puro/
in-memory.

## Fluxo (`responses.ts`)

`classifyOutreachResponse({ response, classifier })` é a ÚNICA porta de
entrada de classificação — sempre recebe um `ResponseClassifier` injetado,
nunca chama IA real diretamente. `shouldStopCadenceForClassification`
consulta o catálogo (`stopsCadence`), nunca reimplementa a regra.

## Capacidades de IA opcional (`catalog.ts::OUTREACH_AI_CAPABILITY_CATALOG`)

`classify_response` · `detect_interest` · `detect_objection` ·
`detect_opt_out` · `suggest_reply` · `recommend_handoff` ·
`generate_summary` · `recommend_next_action` — toda entrada exige o módulo
`ai.agents`, é `simulatedOnly: true` e `lowConfidenceRecommendsHuman: true`.

## Regras (doutrina)

- IA nunca envia mensagem diretamente — envio exige uma camada de canal
  futura (`OutreachChannelAdapter` real, "Outreach Runtime real").
- Classificação sempre inclui `confidence` (0-1).
- Confiança < 0.5 sempre recomenda humano (`deriveHandoffReason`, ver
  [`human-handoff.md`](human-handoff.md)).
- Opt-out detectado pela IA sempre para a cadência (mas quem decide de
  fato é `contacts.is_blocked`, nunca a classificação isolada).
- Conteúdo sempre sanitizado (`sanitization.ts::sanitizeOutreachResponse`)
  antes de logar/persistir.
- Nenhuma chamada a modelo externo (Vercel AI Gateway/Anthropic/OpenAI)
  nesta Foundation — nenhum `lib/ai/*`/`lib/agent-engine/*` é importado por
  `lib/outreach/*`.
- Nenhuma AI Engine independente é criada — IA continua sendo capacidade
  consumida pelo Outreach e por outros módulos específicos.
