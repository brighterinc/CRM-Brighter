---
type: architecture
status: v1
last_updated: 2026-08-13
---

# Simulação — Provider Credentials Runtime

`lib/provider-credentials-runtime/simulation.ts` — 11 cenários nomeados,
100% in-memory (`createInMemoryProviderCredentialsRuntimeDeps`, nunca
banco/rede/provider real). Cada cenário monta seu próprio fixture isolado
(tenant + installation + secret reference + provider connection, via
`lib/control-plane-persistence/services` com `emitAudit` no-op).

## CLI

```bash
pnpm credentials:runtime -- --scenario healthy              --format markdown
pnpm credentials:runtime -- --scenario all                  --format json
pnpm credentials:runtime -- --mode summary                  --format markdown   (default)
```

## Os 11 cenários e o que cada um prova

| Cenário | Outcome esperado | O que prova |
|---|---|---|
| `healthy` | `allowed` | Fluxo completo funciona: policy permite, valor resolvido, usado, lease liberada. |
| `missing-reference` | `denied` | `secretReferenceId` inexistente → `secret_reference_not_found`. |
| `revoked-reference` | `denied` | Referência revogada (`CredentialsVault.revokeReference`) → `secret_reference_not_active:revoked`. |
| `cross-tenant-denied` | `denied` | `ProviderConnection` "válida" de outro tenant apontando pra secret de tenant A → policy recusa mesmo assim. |
| `provider-mismatch` | `denied` | Request pede `provider: "supabase"` mas a secret reference é de `"fake"`. |
| `expired` | `denied` | Lease expirada não pode ser consumida (`CredentialLeaseInvalidTransitionError`) — testado direto em `lease.ts`, sem passar por `withProviderCredential`. |
| `single-use` | `denied` | Segunda chamada de `.use()` numa credencial single-use lança `CredentialAlreadyConsumedError`. |
| `release-on-error` | `error` (ver nota) | Callback lança um erro intencional — o erro propaga E a lease termina em `failed`. |
| `environment-fake` | `allowed` | `EnvironmentRuntimeVaultProvider` habilitado resolve de uma env var SINTÉTICA (`BRIGHTER_RUNTIME_SIMULATION_TOKEN`), setada e restaurada dentro do próprio cenário. |
| `adapter-requirement` | `allowed` | `fake.simulate` declara `requiredCredentialPurpose: "api_call"` — purpose certo passa, purpose errado (`messaging`) é negado. |
| `blocked-operation` | `denied` | Installation com status `archived` → `installation_blocked:archived`. |

## `SIMULATION_SCENARIO_EXPECTED_OUTCOMES`

`release-on-error` é o único cenário cujo outcome CORRETO é `"error"` (o
cenário existe justamente pra provar que o erro do callback propaga e a
lease termina em `failed` — não é um cenário de negação de acesso). Nenhum
consumidor (CLI, teste) deve tratar `outcome: "error"` como falha universal
sem checar `simulationScenarioPassed(result)` — que compara contra o mapa
de outcomes esperados por cenário.

## Nunca vaza valor de segredo

Cada `SimulationScenarioResult` (`{ scenario, outcome, message, details }`)
é seguro por construção — os valores fake usados nos fixtures
(`"synthetic-value-never-real"`, etc.) nunca aparecem em `message`/`details`.
Provado em `tests/unit/provider-credentials-runtime-simulation.test.ts`
(`runAllSimulationScenarios` + assert `not.toMatch(/synthetic-value|fake-value/)`
em cada resultado serializado).

## Uso em `summary.ts`/admin UI

`generateProviderCredentialsRuntimeSummary` aceita `scenarioResults?:
SimulationScenarioResult[]` opcional — o CLI em `--mode summary` já roda os
11 cenários e inclui o resultado no summary (JSON ou Markdown), como prova
viva de que o runtime está funcionando, sem precisar de nenhuma instalação
real persistida.
