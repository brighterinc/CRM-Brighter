---
type: architecture
status: v1 — fundação
last_updated: 2026-08-03
---

# Brighter Monitoring Engine

> Fundação que representa, calcula e resume a saúde operacional de cada
> instalação White Label. Consome `Installation` da Control Plane
> (`lib/control-plane/`) — nunca reimplementa `Tenant`/`DeploymentManifest`/
> `ProvisioningSummary`. "Monitoring Engine" é nome interno de código; a
> tela voltada ao usuário final chama isso de "Monitoramento".

## Objetivo

Antes desta fundação, cada instalação só sabia observar a si mesma — o
Provisioning Engine sabe se as etapas de implantação terminaram, a Control
Plane sabe o estágio comercial/técnico do ponto de vista da Brighter, mas
nenhuma peça respondia "esta instalação está saudável AGORA, e o que fazer
a respeito". O Monitoring Engine resolve isso: dado um catálogo de checks
possíveis e um conjunto de resultados observados (reais no futuro,
sintéticos nesta Foundation v1), calcula saúde geral, score, blockers,
warnings, checks ausentes/atrasados e deriva incidentes — permanecendo uma
camada de domínio pura: sem check real, sem chamada de rede, sem
persistência, sem migration, sem API.

## Princípios (mesma doutrina das fundações anteriores)

- **Camada de domínio, não CRUD.** Tipos, catálogo de checks, validação,
  motor de avaliação, incidentes, repositório in-memory, adaptadores fake/
  noop, resumo — nunca uma API REST nova, nunca uma tabela, nunca uma Edge
  Function, nunca Docker/VPS/DNS/SSL/Supabase/Redis/WAHA reais.
- **Consome `Installation`, nunca `tenant`/`manifest`/`provisioningPlan`
  soltos.** `resolveApplicableMonitoringChecks`/`evaluateMonitoringSnapshot`
  recebem sempre uma `Installation` inteira (`lib/control-plane/types.ts`)
  — ela já É `Tenant` + `DeploymentManifest` + `ProvisioningSummary` +
  branding + módulos. Aceitar os três soltos permitiria uma combinação
  divergente (o mesmo anti-pattern que `validateInstallationInput` da
  Control Plane já existe pra impedir).
- **Nenhum resultado de check é inventado por dedução.** Todo
  `MonitoringCheckResult` vem de um `MonitoringAdapter` fake/noop ou de
  `simulateMonitoringRun` — nunca de uma chamada de rede real.
- **`disabled`/`skipped` nunca contam como sucesso.** Ver `evaluator.ts` —
  um check pulado reduz o score exatamente como um check que falhou.
- **Sem persistência real.** Só existe `InMemoryMonitoringRepository` —
  mesma doutrina das cinco fundações anteriores.
- **Nenhuma dependência da Lumina.** Nenhum arquivo de `lib/monitoring/*`
  lê, escreve ou referencia `/opt/brighter-lumina` (porta 8000).

## Arquitetura

```
lib/monitoring/
  types.ts        — vocabulário + MonitoringCheckDefinition/Result/Snapshot/Incident
  status.ts        — arrays fechados, type guards, pesos de severidade, janelas de cadência
  catalog.ts       — MONITORING_CHECK_CATALOG (~37 checks) + getMonitoringCheckDefinition()
  validation.ts     — validateMonitoringCheckResult()/validateMonitoringSnapshotInput()
  evaluator.ts       — resolveApplicableMonitoringChecks(), evaluateMonitoringSnapshot(), simulateMonitoringRun()
  incidents.ts        — deriveIncidentsFromSnapshot(), acknowledgeIncident(), resolveIncident(), reopenIncident()
  adapters.ts         — MonitoringAdapter, NoopMonitoringAdapter, InMemoryMonitoringAdapter, FakeMonitoringAdapter
  sanitization.ts      — reexporta sanitizeDeep (lib/tenants/export.ts) — nunca reimplementa
  summary.ts          — generateMonitoringSummary(), renderMonitoringSummaryMarkdown(), integração com a Control Plane
  repository.ts       — MonitoringRepository + InMemoryMonitoringRepository + createDemoMonitoringSnapshots()
  index.ts            — barrel público (export *)

app/app/settings/monitoramento/page.tsx   — tela admin-only, somente leitura
scripts/generate-monitoring-summary.ts     — CLI (pnpm monitoring:summary)
```

Assim como `lib/control-plane/`, **nenhum arquivo de `lib/monitoring/*` lê
`process.env`** — `sanitization.ts` importa `sanitizeDeep` de
`@/lib/tenants/export` diretamente (nunca o barrel `@/lib/tenants`).

## `MonitoringCheckDefinition` — o catálogo

Cada check é só uma declaração: plano(s) a que se aplica, módulo(s)
exigido(s) (`requiredModules`, ids de `lib/modules/catalog.ts`), infra
exigida (`requiresInfra`, mesma convenção de
`ProvisioningStepDefinition.requiresInfra`), severidade quando falha e
cadência esperada. Ver [`check-catalog.md`](check-catalog.md) pro catálogo
completo.

## Avaliação (`evaluator.ts`)

`resolveApplicableMonitoringChecks(installation)` filtra o catálogo por
plano + módulos habilitados (`installation.modules`) + infra do manifesto
(`installation.deployment.infrastructure`) — nunca exige Redis/worker/
scheduler no Lite, nunca exige WhatsApp sem o módulo `channel.whatsapp`
ativo.

`evaluateMonitoringSnapshot({ installation, results })` calcula:

- **Saúde geral**: crítico "unhealthy" (ou crítico obrigatório ausente) →
  `unhealthy`; qualquer outra falha (`degraded`, ou "unhealthy" não-crítico,
  ou obrigatório ausente não-crítico) → `degraded`; sem falha e ao menos 1
  check aplicável → `healthy`; nenhum check aplicável → `unknown`.
- **Score (0–100, determinístico)**: peso por severidade
  (`critical: 3, warning: 2, info: 1`); `disabled` não conta em nenhum dos
  lados; tudo que não é `healthy` conta só no denominador.
- **Blockers/warnings**: uma linha por check crítico "unhealthy"/ausente
  (blocker) ou por qualquer outra falha (warning).
- **Checks ausentes/atrasados**: `missingCheckIds` (aplicável sem
  resultado) e `lateCheckIds` (resultado mais velho que a janela de
  tolerância da própria `expectedCadence` — `CHECK_CADENCE_GRACE_MS`).

`simulateMonitoringRun(installation, scenario)` é o dry-run determinístico
— ver [`monitoring-lifecycle.md`](monitoring-lifecycle.md) pros cenários.

## Incidentes (`incidents.ts`)

Ver [`incidents.md`](incidents.md).

## Sanitização (`sanitization.ts`)

Reexporta `sanitizeDeep` de `lib/tenants/export.ts` — a MESMA função que
`lib/provisioning/logging.ts` já reusa. `sanitizeMonitoringCheckResult`/
`sanitizeMonitoringIncident` são wrappers finos que só chamam `sanitizeDeep`
no campo `metadata`. Não existe uma segunda regex de chave sensível.

## Resumo (`summary.ts`)

`generateMonitoringSummary(installation, snapshot)` — view model JSON com
contagens por status, incidentes críticos/em aberto, checks atrasados,
próximos passos, módulos/categorias afetados.
`renderMonitoringSummaryMarkdown(summary)` — mesmo estilo Markdown das CLIs
anteriores.

### Integração com a Control Plane

`attachMonitoringSnapshotToInstallationSummary(installation, snapshot)` e
`generateMonitoringControlPlaneOverview(installations, snapshotByInstallationId)`
respondem as perguntas agregadas da Control Plane (instalações saudáveis,
degradadas, indisponíveis, sem monitoramento, com incidentes críticos,
aguardando ação) — **sem alterar nenhum arquivo de `lib/control-plane/*`**.
A tela `/app/settings/control-plane` poderia consumir essas funções no
futuro; por ora a tela de Monitoramento fica isolada
(`/app/settings/monitoramento`).

## Tela `/app/settings/monitoramento`

Server Component admin-only, mesmo guard de
`/app/settings/control-plane`/`/app/settings/provisionamento`
(`requireAuth()` + `resolveActiveOrg()` +
`ROLE_RANK[...] >= ROLE_RANK.admin` OU `is_platform_admin`, senão
`redirect("/403")`). Somente leitura — sem botão de executar check.
Mostra: instalação atual, plano, saúde geral, score, cards por status,
tabela de checks aplicáveis, tabela de incidentes, categorias/módulos
afetados, blockers e warnings. Nota "Simulação disponível via CLI
(`pnpm monitoring:summary`)".

## CLI (`pnpm monitoring:summary`)

```bash
pnpm monitoring:summary -- --client "Empresa Exemplo" --slug empresa-exemplo \
  --domain crm.empresa.com.br --plan dedicated \
  --modules core.contacts,core.pipeline,channel.whatsapp \
  --scenario healthy --format markdown
```

Monta um tenant temporário, gera o manifesto, monta a `Installation` via
`InMemoryInstallationRepository.createInstallation` (reusa a MESMA
derivação da Control Plane) e roda `simulateMonitoringRun`. Sai com código
!= 0 quando `--scenario critical` ou quando o snapshot resultante é
`unhealthy`.

## Relação com as fundações anteriores

```
White Label Runtime → Module Engine → Deployment Engine → Tenant Engine → Provisioning Engine → Control Plane
                                                                                                        ↓ observado por
                                                                                              Monitoring Engine
```

Nunca duplica: reusa o agregado `Installation` da Control Plane, o
catálogo/resolvedor do Module Engine (`requiredModules`/`requiresInfra`) e
o sanitizador do Tenant Engine. Ver mapa completo em
[`docs/architecture/brighter-platform.md`](../architecture/brighter-platform.md).

## Limitações da Foundation v1

- **Nenhum check real** — nenhum adaptador de `lib/monitoring/adapters.ts`
  toca rede, DNS, SSL, Supabase, Vercel, VPS, Docker, Redis, WAHA, Chatwoot
  ou Evolution.
- **Não persiste nada de verdade** — `InMemoryMonitoringRepository` vive só
  na memória do processo.
- **`chatwoot_available`/`evolution_available` são catálogo-only** — os
  módulos `channel.chatwoot`/`channel.evolution` que eles referenciam ainda
  não existem no Module Engine, então esses dois checks nunca são
  aplicáveis nesta versão (ver [`check-catalog.md`](check-catalog.md)).
- **Não notifica, não abre ticket externo, não envia webhook** — incidentes
  ficam só no `MonitoringRepository` em memória.

## Confirmação: esta versão não executa nenhum check real

Nenhum arquivo de `lib/monitoring/*` chama rede, consulta DNS/SSL/Supabase/
Vercel/VPS/Docker/Redis/WAHA/Chatwoot/Evolution, cria migration, cron ou
worker. A tela e a CLI são puramente leitura/simulação. Nenhuma peça deste
engine acessa `/opt/brighter-lumina` ou a porta 8000.
