---
type: reference
status: v1 — fundação
last_updated: 2026-08-04
---

# Segmentação, audiência e consentimento

> Complementa [`outreach-engine.md`](outreach-engine.md). Todo contato
> nesta Foundation é um `OutreachSyntheticContact` — nunca lido de banco
> real. Os campos espelham (nunca duplicam o tipo inteiro de) `Contact`
> (`lib/types/contacts.ts`): `isBlocked`+`blockedReason`
> (`contacts.is_blocked`/`blocked_reason`) e `consent`
> (`contacts.consent` jsonb `{marketing,transactional,profiling}`).

## Segmento (`segments.ts`)

`OutreachSegment.filters: OutreachSegmentFilter[]` — todos os filtros
precisam bater (AND, nunca OR nesta Foundation). Operadores: `eq` · `neq` ·
`contains` · `not_contains` · `in` · `not_in` · `exists` · `not_exists`.
`evaluateContactAgainstSegment` também respeita `excludeContactIds`
(exclusão explícita por id, independente dos filtros).

## Pipeline de audiência (`audiences.ts`)

`buildAudiencePreview` executa, nesta ordem:

1. `matchSegmentAudience` — casa os filtros do segmento.
2. `deduplicateAudience` — remove `id` repetido (mantém primeira ocorrência).
3. `excludeIneligibleContacts` — aplica as exclusões de elegibilidade
   (primeira regra que bate decide o motivo, nunca múltiplos motivos por
   contato):
   1. `opted_out` — `contact.isBlocked`.
   2. `no_marketing_consent` — canal ≠ `internal` e sem
      `consent.marketing.granted`.
   3. `no_channel_address` — sem telefone (whatsapp/sms) ou e-mail (email).
   4. `already_enrolled` — já existe `OutreachEnrollment` para esse
      contato NESTA campanha.
   5. `already_responded` — já respondeu em algum enrollment anterior
      (`responded`/`qualified`/`transferred`).
4. `maxAudienceSize` — corta o excedente, marcado como
   `excluded_by_segment`.

`calculateAudienceSummary` agrega contagem por
`OutreachIneligibilityReason`.

## Consentimento e elegibilidade (`consent.ts`)

`evaluateContactEligibility(contact, channel)` — mesmas regras acima,
reportadas como `OutreachComplianceEvaluation { eligible, blockers,
warnings, legalBasisNote }`. `legalBasisNote` é sempre a MESMA string,
deixando explícito que **nenhuma regra jurídica nova é inventada aqui** — a
validação legal real (base legal LGPD, jurisdição, finalidade) depende da
operação de cada tenant.

`registerOptOutPreview(contactId, reasonId)` — NUNCA escreve
`contacts.is_blocked` de verdade; só modela o efeito esperado
(`{ contactId, blockedReason, irrevocable: true }`). A escrita real
continua sendo responsabilidade exclusiva de `lib/waha/ingest.ts` (regex
STOP) ou de um bloqueio manual pela tela real de contatos.

`applySuppressionRules(contacts, channel)` — aplica
`evaluateContactEligibility` em lote, devolve `{ suppressed, allowed }`.

## Motivos de opt-out (`catalog.ts::OUTREACH_OPT_OUT_REASON_CATALOG`)

| id | Descrição | Irrevogável |
|---|---|---|
| `stop_keyword` | Regex `STOP\|PARAR\|SAIR\|UNSUBSCRIBE` no inbound — mesma regra de `lib/waha/ingest.ts` | Sim |
| `manual_block` | Bloqueado manualmente por um operador | Sim |
| `complaint` | Contato reclamou do canal/frequência | Sim |
| `invalid_contact` | Número/e-mail inválido ou inexistente | Não |

## Opt-out sempre tem precedência

Em qualquer conflito entre regras (ex.: contato com consentimento de
marketing MAS também `isBlocked: true`), o bloqueio SEMPRE vence — nunca
existe um caminho de código que envie (mesmo que simuladamente) para um
contato bloqueado.
