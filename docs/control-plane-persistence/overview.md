---
type: architecture
status: v1 — persistência real (sem provider real)
last_updated: 2026-08-12
---

# Control Plane Persistence + Credentials Vault

> Dá persistência real (Supabase, banco PRÓPRIO da Brighter) às fundações
> Foundation v1 que só existiam in-memory. Ver `docs/architecture/brighter-platform.md`
> pro mapa completo entre fundações.

## O que esta fase é

O primeiro consumidor real de persistência das fundações `lib/tenants`,
`lib/control-plane`, `lib/deployment` (histórico de manifesto),
`lib/provisioning` (runs/steps) e `lib/provisioning-adapters` (conexões de
provider) — mais o **Credentials Vault**, que é inteiramente novo nesta
fase (não existia nem em memória antes).

8 tabelas novas (`supabase/migrations/20260811000000_0098_control_plane_persistence.sql`):

- `control_plane_tenants`
- `control_plane_installations`
- `control_plane_deployments`
- `control_plane_provisioning_runs`
- `control_plane_provisioning_steps`
- `control_plane_provider_connections`
- `control_plane_secret_references`
- `control_plane_operation_events`

## O que esta fase NÃO é

- **Não conecta nenhum provider real.** `control_plane_provider_connections.mode`
  continua sempre `dry_run`/`simulation` — `"real"` é literal reservado, mesma
  doutrina de `lib/provisioning-adapters/types.ts`.
- **Não guarda nenhum segredo de verdade.** `control_plane_secret_references`
  só tem referência/tipo/provider/vault_provider/vault_key — nunca token,
  senha, chave, connection string. Ver `credentials-vault.md`.
- **Não persiste Monitoring/Billing.** Ficam pra próxima fase do ROADMAP
  ("Provider Credentials Runtime + Real Adapters").

## Onde cada peça mora

| Peça | Path |
|---|---|
| Schema/migration | `supabase/migrations/20260811000000_0098_control_plane_persistence.sql` + apêndice em `supabase/baseline.sql` |
| Tipos de domínio novos | `lib/control-plane-persistence/types.ts` |
| Fail-closed pra segredo | `lib/control-plane-persistence/safe-persistence.ts` |
| Mappers domain↔row | `lib/control-plane-persistence/mappers/` |
| Credentials Vault | `lib/control-plane-persistence/vault/` |
| Repositories persistidos | `lib/control-plane-persistence/repositories/` |
| Camada de serviço | `lib/control-plane-persistence/services.ts` |
| Admin UI (read-only) | `app/app/settings/control-plane/persistence/page.tsx` |
| CLI | `scripts/control-plane-persistence-summary.ts` (`pnpm control:persistence`) |

## Fluxo de uma escrita

```
service (services.ts)
  → assertSafePersistencePayload (fail-closed, defesa em profundidade)
  → repository (Database*Repository OU InMemory*Repository — troca via factory.ts)
       → assertSafePersistencePayload de novo (dentro do repository)
       → INSERT/UPDATE na tabela control_plane_*
  → emitAudit (api_audit_log — "quem fez")
  → operationEvents.recordEvent (control_plane_operation_events — "o que aconteceu")
```

Nenhuma rota/UI/CLI deve chamar um `Database*Repository` direto pra uma
mutação — só via `services.ts`, que garante os dois logs saindo juntos. Ver
`security.md`.

## Como ler os outros docs

1. `schema.md` — tabelas, colunas, FKs, constraints, indexes.
2. `rls.md` — políticas, helper reusado, por que nenhuma tabela é tenant-aware.
3. `credentials-vault.md` — a abstração, o que ela nunca faz.
4. `repositories.md` — In-Memory vs Database, factory, mappers.
5. `security.md` — safe persistence, audit trail, sanitização.
6. `migration.md` — como aplicar (quando decidido), como reverter.
7. `runtime-boundary.md` — a linha exata entre o que existe agora e o que é
   fase futura (provider real, vault real).
