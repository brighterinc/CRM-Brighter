---
type: architecture
status: v1 — fundação
last_updated: 2026-08-02
---

# Provisioning Engine

> Fundação que transforma um `Tenant` (Tenant Engine) + seu `DeploymentManifest`
> (Deployment Engine) num **plano de execução ordenado** — etapas,
> dependências, status, blockers, dry-run, rollback teórico e logs
> sanitizados. "Provisioning Engine" é nome interno de código; a tela
> voltada ao usuário final chama isso de "Provisionamento"
> (`/app/settings/provisionamento`), nunca a marca de quem opera a
> instalação.

## Objetivo

Antes desta fundação, o Tenant Engine já sabia dizer **se** um tenant está
pronto (`evaluateTenantReadiness`) e o Deployment Engine já sabia dizer **o
que** uma instalação precisa (infra, env vars, checklist). Faltava a camada
que decide **em que ordem** fazer isso — um plano de execução com
dependências explícitas, detecção de ciclo, status por etapa, e um jeito
seguro de simular o resultado antes de qualquer execução real. O
Provisioning Engine resolve isso, permanecendo — como toda fundação anterior
— uma camada de domínio pura: sem infraestrutura real, sem chamada externa,
sem persistência.

## Princípios (mesma doutrina das fundações anteriores)

- **Camada de domínio, não CRUD.** Tipos, catálogo tipado de etapas,
  validação, planner (função pura), executor abstrato (interface +
  adaptadores fake/noop), rollback teórico, logs, resumo — nunca uma API
  REST nova, nunca uma tabela, nunca uma Edge Function, nunca integração
  real com Supabase/Vercel/VPS/DNS. Isso vale até a arquitetura pedir
  explicitamente uma camada dona de persistência e execução real (a futura
  **Control Plane** — ver `docs/architecture/brighter-platform.md` e
  `ROADMAP.md`).
- **Consome, nunca duplica, as fundações anteriores.** Reusa
  `evaluateTenantReadiness`/`attachDeploymentManifest` do Tenant Engine,
  `DeploymentManifest`/`DeploymentPlan`/`DeploymentTarget` do Deployment
  Engine, e `sanitizeDeep` do Tenant Engine pra sanitização de log. Nunca
  reimplementa nenhuma dessas regras.
- **`ProvisioningPlan` não guarda o `DeploymentManifest` inteiro** — só
  `manifestFingerprint`. O manifesto completo já vive em `tenant.manifest`;
  duplicá-lo aqui divergiria cedo ou tarde.
- **Sem persistência real.** Todo `ProvisioningPlan` é recalculado em
  memória a cada chamada de `generateProvisioningPlan` — mesma doutrina do
  `InMemoryTenantRepository` do Tenant Engine.
- **Sem infraestrutura real.** Nesta Foundation v1 só existem adaptadores
  fake/noop (`NoopProvisioningAdapter`, `InMemoryProvisioningAdapter`).
  Nenhuma etapa cria VPS, projeto Supabase, deploy Vercel, registro DNS ou
  container Docker.

## Arquitetura

```
lib/provisioning/
  types.ts        — ProvisioningStepStatus/RunStatus/Category, ProvisioningStepDefinition/State,
                     ProvisioningPlan, ProvisioningLogEntry, ProvisioningAdapter
  catalog.ts       — PROVISIONING_STEP_CATALOG + getProvisioningStepDefinition()
  validation.ts    — compatibilidade tenant×manifesto, readiness, detecção de ciclo, sanidade do catálogo
  planner.ts       — generateProvisioningPlan(), calculateProvisioningFingerprint()
  executor.ts      — ProvisioningAdapter, Noop/InMemory adapters, executeProvisioningPlan(), simulateProvisioning()
  rollback.ts       — buildRollbackPlan()
  logging.ts       — createProvisioningLogEntry() (sanitiza com sanitizeDeep do Tenant Engine)
  summary.ts       — generateProvisioningSummary()/renderProvisioningSummaryMarkdown()
  index.ts         — barrel público (export *) — nenhum arquivo lê process.env

app/app/settings/provisionamento/page.tsx   — tela admin-only, somente leitura
scripts/generate-provisioning-plan.ts        — CLI (pnpm provisioning:plan)
```

Diferente do barrel de `lib/tenants` (que reexporta `current-installation.ts`,
que lê `process.env`), **nenhum arquivo de `lib/provisioning/` lê
`process.env`** — o barrel `lib/provisioning/index.ts` é seguro de importar
de qualquer lugar, inclusive de CLI, sem o cuidado extra que a CLI de tenant
precisa (importar submódulo direto).

## Catálogo de etapas (`catalog.ts`)

`PROVISIONING_STEP_CATALOG` declara cada etapa como um
`ProvisioningStepDefinition` — id, nome, categoria, planos aos quais se
aplica (`appliesToPlans`), dependências (`dependsOn`), se é obrigatória
(`required`), se suporta rollback teórico (`supportsRollback`), um
`idempotencyKey` estável (`step.<id>`) e, opcionalmente, `requiresInfra`
(flags de `ModuleInfraRequirements`, reusado do Module Engine — nunca
redefinido — que decidem se a etapa entra no plano conforme a infra já
resolvida pelo `DeploymentManifest`).

Grupos de etapas:

- **Comuns** (todos os planos): `validate_tenant → validate_manifest →
  validate_modules`, `resolve_branding`, `prepare_environment_template →
  configure_application`, `configure_domain → configure_ssl`, `create_owner
  → run_healthcheck → finalize_handoff`.
- **Supabase** (todos os planos — `database`/`auth` são infra mandatória
  nos três perfis, ver `lib/deployment/profiles.ts`): `create_supabase_project
  → configure_supabase_auth → configure_supabase_storage (se
  `infra.storage`) → apply_database_schema → configure_database_policies`;
  `configure_auth` depende de `configure_supabase_auth`.
- **Lite/Pro**: `create_frontend_project → configure_frontend_environment →
  deploy_frontend`.
- **Dedicated**: `prepare_vps → install_runtime → configure_reverse_proxy →
  configure_redis → configure_worker → configure_scheduler`, e depois de
  domínio/SSL: `configure_backup → configure_monitoring`.
- **Canais/IA** (gating por `requiresInfra`, não por plano fixo —
  reaproveita a resolução que o Deployment Engine já fez):
  `configure_email` (`infra.email`), `configure_whatsapp` (`infra.whatsapp`
  — só fica `true` hoje pra Dedicated, já que `channel.whatsapp` só é
  permitido nesse plano no Module Engine), `configure_ai_provider`
  (`infra.ai`).

`getProvisioningStepDefinition(id)` — mesmo padrão de `getModuleDefinition`
do Module Engine.

## Validação (`validation.ts`)

- `validateTenantManifestCompatibility(tenant, manifest)` — reusa
  `attachDeploymentManifest` do Tenant Engine só pra LER o resultado (nunca
  aplica o `tenant` retornado); divergência de slug/domínio/plano/módulos/
  branding vira blocker.
- `validateTenantReadinessForProvisioning(tenant)` — reusa
  `evaluateTenantReadiness`; blockers de prontidão do tenant viram blockers
  de provisionamento (não dá pra montar plano de execução pra um tenant que
  ainda não está pronto).
- `detectCircularStepDependencies(catalog)` — DFS com pilha de recursão;
  recebe `catalog` como parâmetro (default `PROVISIONING_STEP_CATALOG`,
  mesmo padrão de `resolveModuleAvailability({ catalog })` no Module
  Engine) pra permitir teste determinístico com catálogo minúsculo
  malformado — o catálogo real nunca deveria ter ciclo.
- `validateStepCatalog(catalog)` — sanidade: `dependsOn` aponta pra id
  existente, sem id duplicado.

## Planner (`planner.ts`)

`generateProvisioningPlan({ tenant, manifest, catalog? })` é uma função
pura: valida o catálogo, checa compatibilidade tenant×manifesto e
prontidão, seleciona as etapas aplicáveis (`appliesToPlans` + gating de
`requiresInfra`), ordena por Kahn's algorithm restrito ao subconjunto
selecionado (uma dependência apontando pra etapa fora do subconjunto — ex.
`deploy_frontend` num plano Dedicated — é ignorada em vez de travar a
ordenação), monta o `ProvisioningStepState[]` inicial (`"blocked"` se há
blocker global; senão `"ready"` sem dependência dentro do plano, `"pending"`
com dependência) e calcula o `manifestFingerprint`.

`calculateProvisioningFingerprint({ tenantId, tenantSlug, plan, target,
domain, enabledModules, appName })` monta um objeto estável (chaves
ordenadas, módulos ordenados), `JSON.stringify` + `createHash("sha256")` de
`node:crypto`, hex truncado prefixado `prov_`. Determinístico — mesmo input
sempre produz o mesmo fingerprint. **Nunca inclui token, chave, senha ou
connection string** — só os sete campos públicos listados.

## Executor (`executor.ts`)

```ts
type ProvisioningAdapter = {
  supports(stepId: string): boolean;
  execute(stepId: string, ctx: ProvisioningExecutionContext): Promise<ProvisioningStepResult>;
  rollback?(stepId: string, ctx: ProvisioningExecutionContext): Promise<ProvisioningStepResult>;
};
```

Nesta Foundation v1 só existem dois adaptadores, ambos fake:

- `NoopProvisioningAdapter` — sempre "sucesso", nunca faz nada de verdade.
- `InMemoryProvisioningAdapter({ failSteps })` — configurável por id de
  etapa, usado por teste/simulação.

`executeProvisioningPlan(plan, adapter, opts?)` clona o plano de entrada
(nunca muta o argumento), nunca executa etapa `"blocked"`, nunca reexecuta
etapa `"completed"` (idempotência), só roda etapa cujas dependências já
estão `"completed"`, e **pára o run inteiro na primeira falha de etapa
`required`** ("falha crítica" — etapas seguintes ficam como estavam).

`simulateProvisioning(plan, { failStepIds? })` é o dry-run determinístico:
sempre usa `InMemoryProvisioningAdapter`, nunca uma ação real. Ver
`docs/provisioning/provisioning-lifecycle.md` pros estados possíveis.

## Rollback teórico (`rollback.ts`)

`buildRollbackPlan(plan)` — ver `docs/provisioning/rollback-strategy.md`
pra estratégia completa. Resumo: lista, em ordem inversa, só as etapas
`"completed"` que declaram `supportsRollback: true` no catálogo, com uma
descrição textual da ação futura. **Nunca executa nada** — nem aqui, nem em
lugar nenhum desta Foundation.

## Logs estruturados (`logging.ts`)

`createProvisioningLogEntry({ ctx, level, event, message, metadata })`
monta um `ProvisioningLogEntry` e já sanitiza `metadata` com `sanitizeDeep`
**importado de `@/lib/tenants/export`** (reuso explícito, não
reimplementação) — remove recursivamente qualquer chave batendo
`password|token|api[_-]?key|secret|service[_-]?role|database[_-]?url|
connection[_-]?string|ssh[_-]?key|private[_-]?key` (case-insensitive), mesmo
em objeto "sujo" com propriedade extra fora do tipo. Testado em
`tests/unit/provisioning-logging.test.ts` com metadata deliberadamente suja.

## Resumo operacional (`summary.ts`)

`generateProvisioningSummary(plan, manifest?)` — contagens por status,
`rollbackAvailable` (via `buildRollbackPlan`), infraestrutura prevista
(direto do `manifest.infrastructure` se passado; senão inferida das
categorias das etapas do plano), variáveis pendentes (só nomes, só quando
`manifest` é passado — o tipo `DeploymentEnvironment` já garante que nunca
há valor), esforço estimado (categoria qualitativa fixa por plano — nunca
minutos inventados) e o próximo passo recomendado (primeiro blocker, senão
a primeira etapa `"ready"`, senão "plano concluído").
`renderProvisioningSummaryMarkdown(summary)` gera a versão Markdown, mesmo
estilo das CLIs anteriores.

## Tela `/app/settings/provisionamento`

Server Component admin-only, mesmo guard de `/app/settings/operacao`
(`requireAuth()` + `resolveActiveOrg()` + `ROLE_RANK[...] >= ROLE_RANK.admin`,
senão `redirect("/403")`). Somente leitura — sem formulário, sem mutação,
sem botão de provisionar (só o texto "Simulação disponível via CLI").
Mostra: tenant/plano/target/domínio, manifesto (válido/pendente),
fingerprint, prontidão do tenant (reusa `evaluateTenantReadiness`), etapas
ordenadas com status/categoria/dependências, blockers/warnings do plano,
seção de rollback teórico, resumo operacional, e links pra
`/app/settings/operacao`, `/app/settings/deployment` e
`/app/settings/modules`. Linguagem neutra: "Provisionamento", "Plano de
execução", "Etapas", "Dependências", "Bloqueios", "Rollback", "Simulação" —
a string "Brighter Provisioning Engine" nunca aparece em texto visível.

## CLI (`pnpm provisioning:plan`)

```bash
pnpm provisioning:plan -- \
  --client "Empresa Exemplo" \
  --slug empresa-exemplo \
  --domain crm.empresa.com.br \
  --plan lite \
  --modules core.contacts,core.pipeline \
  --simulate \
  --format markdown
```

Monta um tenant **temporário em memória** (nunca persiste), gera o
manifesto, anexa, gera o plano de provisionamento e imprime (JSON ou
Markdown). Com `--simulate`, roda `simulateProvisioning` (opcionalmente com
`--fail <stepId1,stepId2>` pra forçar falha determinística numa etapa) e
imprime a timeline resultante. Não lê `.env`, não altera `.env`, não lê nem
grava segredo, não chama Docker/rede. Sai com código `!= 0` quando o plano
gerado tem blockers.

## Relação com as fundações anteriores

```
White Label Runtime → Module Engine → Deployment Engine → Tenant Engine
                                                                ↓ ordenado por
                                                    Provisioning Engine
```

Nunca duplica: reusa a prontidão do Tenant Engine, o manifesto do
Deployment Engine, e o catálogo/resolvedor do Module Engine (via
`ModuleInfraRequirements`). Ver mapa completo em
[`docs/architecture/brighter-platform.md`](../architecture/brighter-platform.md).

## Limitações da Foundation v1

- **Não persiste nada de verdade** — todo `ProvisioningPlan` é recalculado
  em memória a cada chamada de `generateProvisioningPlan`.
- **Não provisiona infraestrutura** — nenhuma etapa cria VPS, projeto
  Supabase, deploy Vercel, registro DNS ou container Docker. Só existem
  adaptadores fake/noop.
- **Rollback é só teórico** — `buildRollbackPlan` nunca executa nada; ver
  `docs/provisioning/rollback-strategy.md`.
- **Sem Control Plane** — persistência real de tenants/planos/execuções e
  adaptadores reais de infraestrutura ficam pra uma fase futura (ver
  `ROADMAP.md`).

## Confirmação: esta versão não provisiona nada

Nenhum arquivo de `lib/provisioning/*` provisiona VPS, cria projeto
Supabase, interage com Vercel/Cloudflare, configura DNS/Caddy ou sobe
container Docker. Os únicos adaptadores existentes (`NoopProvisioningAdapter`,
`InMemoryProvisioningAdapter`) são fake. A tela e a CLI são puramente
leitura/simulação. Nenhuma peça deste engine acessa `/opt/brighter-lumina`
ou a porta 8000.
