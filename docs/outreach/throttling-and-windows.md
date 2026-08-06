---
type: reference
status: v1 — fundação
last_updated: 2026-08-04
---

# Janela de envio, throttling e templates

> Complementa [`outreach-engine.md`](outreach-engine.md). Datas sempre
> recebidas como parâmetro (`now: Date`) — nunca `Date.now()` implícito,
> nunca timer/cron real.

## Janela de envio (`scheduling.ts`)

`OutreachSendingWindow { timezone, daysOfWeek, startHour, endHour }` —
`daysOfWeek` usa a convenção de `Date#getUTCDay()` (0=domingo..6=sábado).
Conversão de timezone via `Intl.DateTimeFormat` nativo — nunca lib externa
nem tabela de offset hardcoded.

- `isInsideSendingWindow(now, window)` — dia da semana + hora local dentro
  da janela.
- `calculateNextAllowedSendAt(now, window)` — avança hora a hora até achar
  um horário válido (teto de 14 dias — nunca loop infinito).
- `validateSendingWindow(window)` — `daysOfWeek` não-vazio,
  `0 <= startHour <= 23`, `1 <= endHour <= 24`, `startHour < endHour`,
  `timezone` obrigatório.
- `resolveCampaignSchedule(schedule, now)` — `{ insideWindow,
  nextAllowedSendAt }`.

`DEFAULT_OUTREACH_SENDING_WINDOW` — 7h-22h, todos os dias exceto domingo,
`America/Sao_Paulo` — mesma doutrina de CLAUDE.md §WAHA ("Janela 7h-22h,
evitar domingo"). **Feriados não são implementados nesta Foundation**
(`OutreachTimezonePolicy.observeHolidays` é sempre `false`).

## Throttling (`throttling.ts`)

`OutreachThrottlingPolicy { maxPerMinute, maxPerHour, maxPerDay,
minDelaySeconds, maxConcurrent, randomJitterSeconds?, channelLimit?,
installationLimit?, ownerLimit? }`.

`evaluateThrottle(policy, counters)` só FAZ CONTAS sobre contadores
fornecidos pelo chamador — nunca espera de verdade, nunca mede tempo real.
Devolve `{ allowed, delaySeconds, blockers, warnings }` (warning em >= 80%
do limite por minuto/dia).

`calculateThrottleDelay(policy)` — delay mínimo determinístico antes do
PRÓXIMO envio, incluindo o jitter médio (nunca `Math.random`; o jitter real
acontece na camada de canal, fora desta Foundation).

`buildThrottlePreview(policy).estimatedSecondsFor(n)` — estimativa de
tempo total pra `n` mensagens.

### Valores de referência (nunca inventados)

| Política | maxPerMinute | maxPerDay | minDelaySeconds | Fonte |
|---|---|---|---|---|
| `whatsapp_one_to_one` | 50 | 20000 | 1 | `lib/automation/throttle.ts` (1.2s + jitter ≤800ms) |
| `whatsapp_campaign` | 12 | 5000 | 5 | CLAUDE.md §WAHA ("campanha 1 msg/5s") |
| `email_campaign` | 60 | 30000 | 1 | Ritmo conservador de envio transacional em lote |

`DEFAULT_OUTREACH_THROTTLING_POLICY` = `whatsapp_campaign`.

## Templates e personalização (`templates.ts`/`personalization.ts`)

Variáveis fixas e nomeadas: `first_name` · `full_name` · `company_name` ·
`owner_name` · `campaign_name` · `custom.<chave>` — **nunca dot-path
livre, nunca `eval`, nunca JavaScript fornecido por usuário**.
Deliberadamente NÃO reusa nem colide com
`lib/inbox/template-vars.ts::interpolateTemplate` (`{{nome}}`/
`{{primeiro_nome}}`, escopo de resposta rápida) nem
`lib/automation/template.ts::renderTemplate` (motor legado, dot-path
arbitrário).

- `validateTemplate(template)` — vazio, variável desconhecida, variável
  sensível (regex `password|token|api[_-]?key|secret|cpf|cnpj|card|cvv|
  ssh[_-]?key`).
- `detectMissingVariables(body, availableValues)` — variáveis sem valor
  disponível.
- `personalizeOutreachContent(template, ctx)` — substitui `{{variavel}}`;
  se faltar valor E o template tiver `fallbackBody`, usa o fallback
  INTEIRO (nunca substituição parcial silenciosa); sem fallback, deixa o
  placeholder literal e reporta em `missingVariables`.
- `generateTemplatePreview(template, ctx)` — atalho pro conteúdo final.
