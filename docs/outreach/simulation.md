---
type: reference
status: v1 — fundação
last_updated: 2026-08-04
---

# Simulação

> Complementa [`outreach-engine.md`](outreach-engine.md).
> `simulateOutreachScenario(scenario, opts?)` é o dry-run determinístico —
> sempre usa adaptadores fake (`FakeOutreachChannelAdapter`/
> `FakeResponseClassifier`), NUNCA canal/IA real. Cada cenário é NOMEADO e
> determinístico (nunca `Math.random`). Delay/janela nunca usam
> `setTimeout` real — sempre aritmética sobre um `now` explícito.

## Cenários (`OUTREACH_SIMULATION_SCENARIOS`, 24 no total)

| Cenário | O que simula |
|---|---|
| `healthy` | Campanha ativa, audiência elegível, enrollments ativados na primeira etapa. |
| `scheduled` | Campanha em `scheduled` (ainda não ativada). |
| `active` | Campanha `active` (mesmo caminho de `healthy`, nome explícito). |
| `completed` | Campanha `active → completed`. |
| `paused` | Campanha `active → paused`. |
| `cancelled` | Campanha `draft → cancelled`. |
| `audience_empty` | Nenhum contato sintético — audiência vazia. |
| `contact_opted_out` | Tentativa de enrollment de contato `isBlocked: true` (motivo `stop_keyword`) — rejeitada. |
| `contact_blocked` | Tentativa de enrollment de contato `isBlocked: true` (motivo `manual_block`) — rejeitada. |
| `duplicate_enrollment` | Segundo `createEnrollment` pro mesmo par campanha/contato — rejeitado por idempotência. |
| `throttled` | `evaluateThrottle` com contadores no limite por minuto — bloqueado. |
| `outside_window` | `isInsideSendingWindow` avaliada num domingo de madrugada — fora da janela. |
| `reply_interested` | Resposta inbound classificada como `interested` — recomenda handoff. |
| `reply_objection` | Resposta inbound classificada como `objection` — recomenda handoff. |
| `reply_opt_out` | Resposta inbound "PARAR" — classificada `opt_out`, cadência para. |
| `reply_unknown` | Resposta ambígua — classificação `unknown`, confiança baixa. |
| `human_handoff` | Resposta pedindo reunião — `shouldHandoff: true`, motivo `interested`. |
| `ai_low_confidence` | Resposta sem padrão reconhecido — `low_confidence`, recomenda humano. |
| `channel_unavailable` | `MonitoringSnapshot` sintético com `waha_available: "unhealthy"` — canal bloqueado. |
| `billing_limit` | `validateOutreachEntitlement` com uso igual ao limite `campaignsPerMonth`. |
| `module_disabled` | Instalação sem `channel.whatsapp` habilitado — campanha bloqueada. |
| `template_missing_variable` | Template referencia variável sem valor disponível e sem fallback. |
| `retry_success` | `FakeOutreachChannelAdapter` sem falhas configuradas — 1ª tentativa sucede. |
| `retry_exhausted` | `FakeOutreachChannelAdapter` configurado pra falhar sempre — 3 tentativas esgotadas. |

## Resultado (`OutreachSimulationResult`)

`{ scenario, installation, campaign, cadence, segment, audiencePreview,
enrollments, responses, aiDecision?, handoff?, throttleEvaluation?,
scheduleEvaluation?, metrics, blockers, warnings, passes }` — sempre o
MESMO shape, independente do cenário (campos opcionais ausentes quando não
aplicáveis ao cenário).

## CLI (`pnpm outreach:summary`)

```bash
pnpm outreach:summary -- --client "Empresa Exemplo" --slug empresa-exemplo \
  --domain crm.empresa.com.br --plan dedicated \
  --modules core.contacts,channel.whatsapp,automation.campaigns,ai.agents \
  --scenario reply_interested --format markdown
```

Flags opcionais: `--target vercel|cloudflare|vps`, `--format json|markdown`
(default `json`), branding (`--app-name`, `--legal-name`, `--logo-url`,
`--favicon-url`, `--support-email`, `--website-url`, `--from-name`,
`--from-email`).

### Regra de exit code

Sai com código != 0 SÓ quando o cenário invocado está em
`CRITICAL_SCENARIOS` (`contact_opted_out`, `contact_blocked`,
`duplicate_enrollment`, `throttled`, `outside_window`,
`channel_unavailable`, `billing_limit`, `module_disabled`,
`template_missing_variable`, `retry_exhausted`) **E** a simulação de fato
reportou blocker. O blocker "`automation.campaigns` não autorizado" está
SEMPRE presente (o módulo é `status: "planned"` — nunca autorizado em
produção nesta Foundation) e por isso NUNCA, sozinho, decide o exit code —
senão todo cenário sairia != 0, mascarando o sinal real do cenário
simulado.

## Nunca dado real

`createDemoContacts()` (em `simulation.ts`) gera 8 contatos SINTÉTICOS
fixos — nunca consulta `contacts`/`crm_leads` reais. Todo `now`/timestamp é
determinístico por cenário (não `Date.now()` implícito onde importa pro
resultado), garantindo que a mesma chamada sempre produz o mesmo shape de
resultado (embora `id`s gerados via `crypto.randomUUID()` mudem a cada
execução, como em toda fundação anterior).
