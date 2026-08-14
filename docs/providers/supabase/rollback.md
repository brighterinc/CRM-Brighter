---
type: reference
status: v1
last_updated: 2026-08-13
---

# Real Supabase Adapter — Rollback

**Nesta etapa, rollback real nunca executa automaticamente — só preview.**
`buildSupabaseRealRollbackPreview()` (`supabase-real-rollback.ts`) é uma
função pura, nunca I/O.

## `project.create`

Único caso com efeito reversível teórico (mesmo não sendo executado nesta
etapa — o preview já documenta o risco pra quando uma etapa futura
implementar o `POST` de verdade):

```ts
{
  operation: "project.create",
  reversible: true,
  requiresHumanApproval: true,
  dataLossRisk: true,
  steps: [
    "projeto Supabase criado (Auth + Postgres)",
    "ação reversa: remover o projeto via Management API",
    "exige aprovação humana explícita antes de qualquer remoção",
  ],
  warnings: ["nunca apagar o projeto automaticamente — risco de perda de dados"],
}
```

**Nenhum código deste adapter jamais chama `DELETE /v1/projects/{ref}`.**

## Demais operações

Todas as outras 7 operações desta etapa são leitura (`project.validate`/
`project.read`/`project.status`) ou reservadas (`database.prepare`/
`auth.configure`/`storage.prepare`/`edge_functions.prepare`) — sem efeito
mutável, então `reversible: false`, `steps: []`.

## Onde aparece

- `dryRunSupabaseRealOperation().rollbackPreview` (quando
  `catalogEntry.supportsRollbackPreview`).
- `createRealSupabaseProvisioningAdapter(deps).rollbackPreview(request)` —
  ponte pro shape `ProvisioningRollbackPreview` (`../types.ts`), mesmo
  contrato do blueprint dry-run.
- Admin UI (`/app/settings/control-plane/providers/supabase`) — coluna
  "Rollback preview" na tabela de operações.
