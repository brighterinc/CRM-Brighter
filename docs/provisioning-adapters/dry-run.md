---
type: architecture
status: v1 — fundação
last_updated: 2026-08-09
---

# Dry-run — `executeProvisioningDryRun`

`lib/provisioning-adapters/executor.ts::executeProvisioningDryRun(plan, options)`
roda dry-run **por provider** pra cada etapa de um `ProvisioningPlan`
(`lib/provisioning/`). Complementa (nunca substitui)
`lib/provisioning/executor.ts::executeProvisioningPlan` — aquele roda o
`ProvisioningAdapter` genérico do Provisioning Engine; este resolve, por
etapa, qual PROVIDER concreto a executaria.

## Regras

1. **Blockers globais do plano** (`plan.blockers.length > 0`) → nenhum
   dry-run roda, `outcomes` vem vazio. Mesma regra de
   `lib/provisioning/executor.ts`.
2. **Ordem** — reusa `plan.steps` (já topológico, calculado por
   `lib/provisioning/planner.ts`) — nunca reordena.
3. **Dependências** — pra cada etapa, olha
   `getProvisioningStepDefinition(stepId).dependsOn` (reusado, nunca
   duplicado) filtrado ao subconjunto presente no plano.
4. **Propagação de bloqueio**:
   - Etapa `unmapped` (sem provider nesta fundação) — NUNCA bloqueia
     dependentes. Não há infra pendente à espera.
   - Etapa com `missing_adapter`/`missing_capability`/`incompatible_plan` —
     propaga bloqueio (configuração incompleta, infra incerta).
   - Etapa cujo `dryRun` devolveu status fora de
     `READY_ADAPTER_RESULT_STATUSES` (`"simulated"`/`"ready"`) — propaga
     bloqueio.
5. **Idempotência** — se um `ProvisioningAdapterRepository` for passado,
   antes de chamar `adapter.dryRun` o executor procura por
   `idempotencyKey` já resolvida (`findByIdempotencyKey`) e REUSA o
   resultado — nunca gera um novo `requestId` pro mesmo input.

## Saída

```ts
type ExecuteProvisioningDryRunResult = {
  planId: string;
  outcomes: ProvisioningAdapterStepOutcome[]; // { stepId, mapping, result? }
};
```

`mapping` vem de `mapProvisioningStepToAdapterRequest` — um dos 5 status:
`"resolved"` | `"unmapped"` | `"missing_adapter"` | `"missing_capability"` |
`"incompatible_plan"`. `result` só existe quando `mapping.status === "resolved"`
(ou quando a etapa foi bloqueada por dependência, caso em que um resultado
sintético `status: "blocked"` é anexado).

## Nunca executa provider real

Cada chamada de `adapter.dryRun(request)` delega pro blueprint do provider
(`providers/*.ts`), que nunca chama rede/Docker/shell — ver
`security.md`.
