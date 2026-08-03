---
type: reference
status: v1 — fundação
last_updated: 2026-08-03
---

# Ciclo de vida de um `MonitoringSnapshot`

> Ver [`monitoring-engine.md`](monitoring-engine.md) pra visão geral da
> fundação. Este doc é só o "estados e transições" de uma rodada de
> avaliação e dos cenários de simulação.

## `MonitoringRunStatus`

| Status | Significado |
|---|---|
| `draft` | Nenhum check aplicável foi resolvido pra esta instalação (ex.: plano sem nenhum módulo compatível). |
| `running` | Reservado pra uma futura execução real assíncrona — não usado por `evaluateMonitoringSnapshot` nesta Foundation (a avaliação é síncrona e determinística). |
| `completed` | Todos os checks aplicáveis têm um `MonitoringCheckResult` correspondente. |
| `partial` | Ao menos 1 check aplicável ficou sem resultado (`missingCheckIds` não vazio). |
| `failed` | Reservado pra uma futura falha do próprio motor de avaliação (não confundir com `overallHealth: "unhealthy"`, que é uma instalação doente, não uma avaliação que falhou). |

## `MonitoringCheckStatus` por resultado

| Status | Conta como sucesso no score? | Observação |
|---|---|---|
| `healthy` | Sim | Único status que soma no numerador do score. |
| `degraded` | Não | Vira warning (ou blocker, se check obrigatório crítico — ver regra abaixo). |
| `unhealthy` | Não | Vira blocker se `severityWhenFailed: "critical"`; senão warning. |
| `unknown` | Não | Status sintético usado internamente quando um check aplicável não tem resultado (`missingCheckIds`). |
| `pending` | Não | Reservado pra um check que começou mas ainda não terminou (adaptador real futuro). |
| `skipped` | Não | O adaptador decidiu não rodar o check (ex.: `NoopMonitoringAdapter`) — nunca finge sucesso. |
| `disabled` | Não conta em nenhum lado | Excluído do numerador E do denominador do score — nem penaliza, nem ajuda. |

## `overallHealth` — regra de decisão

```
nenhum check aplicável                                → "unknown"
algum check crítico "unhealthy" (ou ausente)          → "unhealthy"
algum "degraded" OU "unhealthy" não-crítico            → "degraded"
(nenhuma das anteriores, com ≥1 check aplicável)        → "healthy"
```

## Cenários de `simulateMonitoringRun`

| Cenário | O que muda |
|---|---|
| `healthy` | Todos os checks aplicáveis retornam `healthy`. |
| `degraded` | `storage_available` vira `degraded`. |
| `critical` | `database_reachable` vira `unhealthy`. |
| `ssl-expiring` | `ssl_expiration` vira `degraded`. |
| `dns-failure` | `dns_resolves` vira `unhealthy`. |
| `database-failure` | `database_reachable` vira `unhealthy`. |
| `redis-failure` | `redis_available` vira `unhealthy` (só afeta instalações Dedicated com Redis exigido). |
| `worker-down` | `worker_running` vira `unhealthy` (só afeta instalações com módulo que exige worker). |
| `whatsapp-down` | `whatsapp_channel_configured` e `waha_available` viram `unhealthy` (só afeta instalações com `channel.whatsapp` ativo). |
| `backup-stale` | `backup_recent` vira `degraded`. |
| `missing-checks` | Omite o resultado de 1 check aplicável (não-crítico, quando existe) — exercita `missingCheckIds`. |
| `stale-checks` | Observa os checks de cadência `hourly`/`daily` com um `observedAt` mais velho que a janela de tolerância — exercita `lateCheckIds`. |
| `multiple-critical` | `database_reachable`, `dns_resolves` e `ssl_valid` viram `unhealthy` simultaneamente. |

Os cenários `lite-saudável`/`pro-saudável`/`dedicated-saudável` e "múltiplas
falhas críticas por plano" não precisam de um cenário próprio — bastam
`healthy`/`multiple-critical` rodados contra uma `Installation` de cada
plano, já que `resolveApplicableMonitoringChecks` filtra os checks
corretos por plano automaticamente.
