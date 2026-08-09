---
type: architecture
status: v1 — fundação
last_updated: 2026-08-09
---

# Rollback preview

`lib/provisioning-adapters/rollback.ts::generateProvisioningRollbackPreview(outcomes)`
**nunca executa rollback nenhum** — só lista, em ordem inversa, os desfechos
de `executeProvisioningDryRun` que chegaram a um resultado pronto/simulado
(`READY_ADAPTER_RESULT_STATUSES`), com o rollback teórico já embutido no
`ProvisioningAdapterResult` de cada provider
(`providers/base.ts::rollbackPreview`).

Mesmo espírito de `lib/provisioning/rollback.ts::buildRollbackPlan`, um nível
abaixo (por provider, não por etapa abstrata do Provisioning Engine).

## O que é revertível hoje

Cada capability declara `supportsRollbackPreview: boolean`
(`capabilities.ts`). Quando `true`, o blueprint do provider descreve os
passos textuais de um rollback futuro (`buildRollbackSteps`); quando
`false`, o resultado vem com `reversible: false` e um warning explicando por
quê.

## O que nunca é sugerido automaticamente

- **`vps.server.validate`** (`prepare_vps`) — recurso caro e potencialmente
  compartilhado no nível físico, mesma decisão deliberada de
  `lib/provisioning/catalog.ts` (`prepare_vps.supportsRollback: false`).
- **`supabase.database.prepare`/`database.policies`** — aplicar/reverter
  schema nunca é uma operação "prevista" de rollback automático.
- **`dns.domain.validate`** / **`redis.connection.validate`** — validações,
  não criam recurso, não há o que reverter.

## Formato

```ts
type ProvisioningAdapterRollbackEntry = {
  stepId: string;
  provider: ProvisioningProvider;
  operation: string;
  reversible: boolean;
  steps: string[];
  warnings: string[];
};
```

A ordem da lista é a **ordem inversa** de conclusão — a última etapa
concluída aparece primeiro, espelhando "desfazer de trás pra frente".
