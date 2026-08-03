---
type: reference
status: v1 — fundação
last_updated: 2026-08-03
---

# Incidentes do Monitoring Engine

> Ver [`monitoring-engine.md`](monitoring-engine.md) pra visão geral da
> fundação.

## O que é um `MonitoringIncident`

Um incidente é sempre **derivado** de um check em falha — nunca criado à
mão fora de `deriveIncidentsFromSnapshot` (`lib/monitoring/incidents.ts`).
Carrega `severity` (herdada do `severityWhenFailed` do check de origem),
`sourceCheckId`, `nextAction` (herdado do `nextRecommendedAction` do
resultado) e `metadata` (já deve passar por `sanitizeMonitoringIncident`
antes de logar/persistir).

## `MonitoringIncidentStatus`

| Status | Significado |
|---|---|
| `open` | Recém-derivado, ninguém olhou ainda. |
| `acknowledged` | Alguém reconheceu (`acknowledgeIncident`, opcionalmente com `assignedTo`). |
| `investigating` | Reservado pro fluxo manual/futuro de "alguém está investigando" — nenhuma função desta Foundation seta esse status automaticamente. |
| `resolved` | `resolveIncident` — `resolvedAt` setado. |
| `ignored` | Reservado pro fluxo manual de "decidimos não agir" — sem função dedicada nesta Foundation (setável via `MonitoringRepository.updateIncident`). |

`OPEN_INCIDENT_STATUSES` (`status.ts`) = `["open", "acknowledged", "investigating"]`
— os três estados que ainda contam como "em aberto" pra deduplicação e pras
contagens de `summary.ts`/`generateMonitoringControlPlaneOverview`.

## Deduplicação (`deriveIncidentsFromSnapshot`)

Pura — nunca muta a lista recebida, retorna só os incidentes NOVOS a somar:

```ts
const novos = deriveIncidentsFromSnapshot(snapshot, incidentesJaAbertos);
```

Um novo incidente só é criado se **não existe** um incidente com o MESMO
`installationId` + `sourceCheckId` já em `OPEN_INCIDENT_STATUSES`. Isso
evita reabrir 1 incidente por rodada de avaliação pro mesmo check
continuamente em falha — o incidente existente continua representando o
problema até alguém resolvê-lo (ou ele reabrir via `reopenIncident`).

## Transições

```
deriveIncidentsFromSnapshot() ──────────────► "open"
"open" ──────────► acknowledgeIncident() ──► "acknowledged"
"acknowledged"/"open" ──► resolveIncident() ──► "resolved"
"resolved" ──────► reopenIncident() ────────► "open" (limpa acknowledgedAt/resolvedAt)
```

Todas as três funções (`acknowledgeIncident`/`resolveIncident`/
`reopenIncident`) são puras — retornam um NOVO objeto, nunca mutam o
incidente recebido. Persistir a transição é responsabilidade de quem
chama (`MonitoringRepository.updateIncident`).

## Nesta Foundation v1

- Tudo em memória (`InMemoryMonitoringRepository`).
- **Nenhuma notificação** — nenhum e-mail, push, Slack.
- **Nenhum webhook** disparado.
- **Nenhum ticket externo** criado (sem integração com sistema de suporte).

Esses três pontos ficam pra uma fase futura, quando o Monitoring Engine
ganhar persistência real (mesma doutrina de "Persistência real da Control
Plane" no `ROADMAP.md`).
