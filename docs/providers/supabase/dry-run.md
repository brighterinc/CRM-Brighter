---
type: reference
status: v1
last_updated: 2026-08-13
---

# Real Supabase Adapter — Dry-run

`dryRunSupabaseRealOperation()` (`supabase-real.ts`) **nunca** chama rede,
**nunca** resolve credencial, funciona sem `REAL_PROVISIONING_ENABLED` e sem
`ControlPlaneRepositories`/`WithProviderCredentialDeps` nenhum — é uma função
pura sobre o catálogo estático + o `request` recebido.

## O que mostra (nunca token)

| Campo | Descrição |
|---|---|
| `operation` | id da operação (`project.read`, …) |
| `classification` | `real_supported` \| `dry_run_only` \| `planned` |
| `target` | `{ installationId, tenantId }` |
| `requiredCredentials` | `{ purpose, secretType }` — só o vocabulário, nunca a referência real |
| `requiredInputFields` | campos exigidos pelo catálogo |
| `missingInputFields` | subconjunto de `requiredInputFields` ausente no `request.input` |
| `endpoint` | descrição LÓGICA (ex. `"GET /v1/projects/{ref}"`) — nunca uma URL montada de verdade |
| `blockers` | um item por `missingInputFields`, ou erro estrutural do request |
| `warnings` | ex. "gate desligado — mesmo real_supported, executeReal vai bloquear" |
| `estimatedEffects` | texto — "somente leitura", "criaria um projeto (não executado)", ou "reservado" |
| `rollbackCapability` | "preview disponível" ou "não aplicável" |

## Exemplo

```ts
import { dryRunSupabaseRealOperation } from "@/lib/provisioning-adapters/providers/supabase-real";

const result = dryRunSupabaseRealOperation({
  installationId: "inst_1",
  tenantId: "tenant_1",
  operation: "project.read",
  input: { projectRef: "abcxyz" },
  correlationId: crypto.randomUUID(),
  requestedAt: new Date().toISOString(),
});
// result.status === "simulated"
// result.output.endpoint === "GET /v1/projects/{ref}"
```

Ver `pnpm supabase:adapter -- --scenario dry-run` pro mesmo fluxo via CLI.
