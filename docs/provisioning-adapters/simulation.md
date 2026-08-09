---
type: reference
status: v1 — fundação
last_updated: 2026-08-09
---

# Simulação — os 22 cenários

`lib/provisioning-adapters/simulation.ts::simulateProvisioningAdapterScenario(scenario)`
é o dry-run determinístico pedido — nunca cria infraestrutura real, nunca
persiste fora de um `InMemoryProvisioningAdapterRepository` local do próprio
cenário. Usa `createDemoInstallations()` (`lib/control-plane/repository.ts`)
como base — 1 instalação demo por plano (Lite/Pro/Dedicated).

## Correção de fixture — `ensureHealthyTenant`

`createDemoTenants()` (`lib/tenants/repository.ts`) não preenche todo item
BLOCKER de `evaluateTenantReadiness` (`lib/tenants/readiness.ts`) — nenhum
dos 3 tenants demo tem `accountManager`, e o tenant Lite base não tem
`branding.supportEmail`/`infrastructure`/`supabase`. Como
`generateProvisioningPlan` chama `validateTenantReadinessForProvisioning`
(passthrough de `evaluateTenantReadiness`), as 3 instalações demo nasceriam
SEMPRE com `plan.blockers` preenchido — mesmo pros cenários que nada têm a
ver com prontidão de tenant (responsabilidade já testada da Tenant Engine).
`pickInstallation` preenche só os campos AUSENTES antes de gerar o plano —
nunca sobrescreve o que o fixture já definiu, nunca muta o fixture
compartilhado, e recalcula `installation.provisioning` pra não deixar
divergente do `plan` que o resto do arquivo usa.

## Os 22 cenários

| Cenário | Demonstra |
|---|---|
| `lite-healthy` | Dry-run completo, plano Lite, sem blocker |
| `pro-healthy` | Dry-run completo, plano Pro, sem blocker |
| `dedicated-healthy` | Dry-run completo, plano Dedicated, sem blocker |
| `missing-adapter` | Registry sem o adapter `supabase` — cascata total (quase tudo depende de Supabase) |
| `capability-missing` | Adapter `vercel` registrado mas sem a operação `project.create` |
| `invalid-request` | Request com campos obrigatórios ausentes → `status: "blocked"` |
| `dependency-failure` | Registry sem `vps` — cascata pelas etapas Dedicated que dependem de `prepare_vps` |
| `supabase-ready` … `waha-ready` (10 cenários) | Um adapter, uma operação representativa, chamado direto (fora do fluxo de etapas pros providers sem step próprio) |
| `rollback-preview` | Dry-run saudável + `rollbackPreview` populado |
| `idempotent-repeat` | Roda o dry-run 2x com o mesmo repositório — prova que `requestId` da 2ª rodada é IGUAL ao da 1ª |
| `blocker` | `plan.blockers` sintético → nenhuma etapa roda |
| `partial` | Registry sem `docker` — mistura real de prontas e bloqueadas |
| `failed-step` | Sentinela `__simulateFailure` → `status: "failed"` |

Todos determinísticos: nenhum `Math.random()`/`Date.now()` implícito decide
o RESULTADO (só o campo `completedAt`, que é timestamp de execução, mesmo
padrão de `lib/provisioning/logging.ts` e `lib/control-plane/summary.ts`).

## CLI

```bash
pnpm provisioning:adapters -- --scenario dedicated-healthy --format markdown
```

Sai com código `!= 0` quando o cenário é um dos "críticos" documentados
(`missing-adapter`, `capability-missing`, `invalid-request`,
`dependency-failure`, `blocker`, `partial`, `failed-step`) E a simulação de
fato reportou blocker — mesma regra de `generate-marketplace-summary.ts`.
