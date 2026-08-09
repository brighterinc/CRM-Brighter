---
type: reference
status: v1 — fundação
last_updated: 2026-08-09
---

# Contrato `ProvisioningProviderAdapter`

Cada blueprint em `lib/provisioning-adapters/providers/*.ts` implementa:

```ts
type ProvisioningProviderAdapter = {
  readonly providerId: ProvisioningProvider;
  capabilities(): ProvisioningAdapterCapability[];
  supports(operation: string): boolean;
  validate(request: ProvisioningAdapterRequest): { valid: boolean; errors: string[] };
  dryRun(request: ProvisioningAdapterRequest): Promise<ProvisioningAdapterResult>;
  rollbackPreview(request: ProvisioningAdapterRequest, result?: ProvisioningAdapterResult): ProvisioningRollbackPreview;
  sanitizeInput(input: Record<string, unknown>): Record<string, unknown>;
  sanitizeOutput(output: Record<string, unknown>): Record<string, unknown>;
  executeReal(request: ProvisioningAdapterRequest): Promise<ProvisioningAdapterResult>;
};
```

## `executeReal` é sempre reservado

Nenhum adapter desta fundação implementa `executeReal` de fato — todos herdam
o comportamento de `providers/base.ts::createProvisioningProviderAdapter`,
que sempre lança:

```ts
class RealProvisioningDisabledError extends Error {
  constructor(provider: ProvisioningProvider, operation: string) { ... }
}
```

Isso é verificado em teste (`tests/unit/provisioning-adapters-providers.test.ts`)
pros 14 providers — nenhum pode retornar sucesso de `executeReal`.

## Base compartilhada — `providers/base.ts`

Pra nunca duplicar o boilerplate de validação/sanitização/bloqueio de
`executeReal` entre os 14 arquivos de provider (CLAUDE.md anti-pattern #2),
existem duas fábricas:

- `createProvisioningProviderAdapter(blueprint)` — caso geral: o blueprint só
  declara `providerId`, `buildOutput(request, capability)` e
  `buildRollbackSteps(request, capability)`.
- `createTableDrivenProvisioningProviderAdapter(providerId, operationDetails)`
  — variante usada por 12 dos 14 providers: cada operação só declara
  `{ message, rollback, extra? }` num objeto plano.

`capabilities()`/`supports()` são sempre derivados de
`listCapabilitiesForProvider(providerId)` (`capabilities.ts`) — nunca
inventados por instância. Isso significa que testar um adapter "com
capability reduzida" (cenário `capability-missing` de `simulation.ts`) exige
um wrapper explícito que reimplementa `validate`/`dryRun` checando
`supports()` primeiro — ver `simulation.ts::buildReducedCapabilityAdapter` —
porque as closures internas de `base.ts` não leem de volta as propriedades do
objeto retornado.

## `validate` nunca lança

Sempre devolve `{ valid, errors }`. `dryRun` chama `validate` internamente e,
se inválido, devolve `status: "blocked"` com `blockers` preenchido — nunca
lança exceção pro chamador. O único caso de exceção real do próprio
`registry.ts` é `ProvisioningAdapterAlreadyRegisteredError` (registrar dois
adapters pro mesmo `providerId`).

## Sentinela de falha simulada

`request.input.__simulateFailure === true` faz `dryRun` devolver
`status: "failed"` diretamente — só usado por `simulation.ts` (cenário
`failed-step`), nunca setado por `mapper.ts` num request real. Mesmo espírito
do `failSteps` configurável de `InMemoryProvisioningAdapter`
(`lib/provisioning/executor.ts`).
