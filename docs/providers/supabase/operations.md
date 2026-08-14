---
type: reference
status: v1
last_updated: 2026-08-13
---

# Real Supabase Adapter — Operações

Catálogo completo em `lib/provisioning-adapters/providers/supabase-real-operations.ts`
(`SUPABASE_REAL_OPERATION_CATALOG`).

## `project.validate` — `real_supported`

Valida que a credencial resolve e, se `input.projectRef` foi informado, que
há acesso a esse projeto específico.

- Sem `projectRef`: `GET /v1/projects` (lista) — sucesso (200) já confirma
  que o token é válido.
- Com `projectRef`: `GET /v1/projects/{ref}` — sucesso confirma token válido
  **e** acesso ao projeto.
- `requiredInputFields`: nenhum.

## `project.read` — `real_supported`

Lê o projeto Supabase existente da instalação. `GET /v1/projects/{ref}`.
`requiredInputFields`: `projectRef`.

## `project.status` — `real_supported`

Mesma chamada de `project.read` (subconjunto — hoje a Management API não tem
endpoint de status dedicado; o output inclui o campo `status` do projeto).
`requiredInputFields`: `projectRef`.

## `project.create` — `dry_run_only` (de propósito, mesmo com gate ligado)

Prepararia/validaria o request de criação
(`POST /v1/projects`, `requiredInputFields`: `name`, `organizationId`,
`region`) — mas **não executa** nesta etapa. `executeReal("project.create")`
sempre lança `SupabaseOperationNotRealSupportedError`, independente do gate.
Rollback preview disponível (`supabase-real-rollback.ts`) já documentando o
risco pra quando uma etapa futura implementar o POST de verdade.

## `database.prepare` / `auth.configure` / `storage.prepare` / `edge_functions.prepare` — `planned`

Reservadas pra etapa futura. Nenhuma chamada real implementada — só dry-run
(mesmo texto teórico do blueprint `supabase.ts`, adaptado ao formato deste
catálogo).

## Dry-run — sempre disponível, nunca I/O

`dryRunSupabaseRealOperation(request)` funciona pra QUALQUER operação do
catálogo, com o gate ligado ou desligado, sem credencial nenhuma. Retorna:

```ts
{
  operation, classification, mode: "dry_run",
  status: "simulated" | "blocked",     // blocked se faltar requiredInputFields
  output: {
    operation, classification, target, requiredCredentials,
    requiredInputFields, missingInputFields, endpoint,
    estimatedEffects, rollbackCapability,
  },
  blockers, warnings, rollbackAvailable, rollbackPreview?,
  idempotencyKey, attempts: 0, completedAt,
}
```

## Execução real — só pras 3 `real_supported`

`executeRealSupabaseOperation(deps, request)` — ver
`docs/providers/supabase/security.md` pro fluxo completo de gate + credencial
+ retry. Retorna o mesmo shape acima com `mode: "real"`, `status: "ready"` e
`output` mapeado da resposta real (via `supabase-mapper.ts`, allowlist
explícita de campos — nunca eco cru da resposta da API).

## Ponte pra `ProvisioningProviderAdapter`

`createRealSupabaseProvisioningAdapter(deps)` expõe o mesmo objeto que
qualquer blueprint (`validate`/`dryRun`/`rollbackPreview`/`sanitizeInput`/
`sanitizeOutput`/`executeReal`), mas **não registrado** no registry default —
ver `docs/providers/supabase/overview.md#onde-vive`.
