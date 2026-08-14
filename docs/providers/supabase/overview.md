---
type: architecture
status: v1 — primeiro provider real, 3/8 operações real_supported
last_updated: 2026-08-13
---

# Real Supabase Adapter — Overview

Primeiro provider REAL da Brighter Provisioning Adapters. Diferente do
blueprint dry-run existente (`lib/provisioning-adapters/providers/supabase.ts`,
que só declara mensagem/rollback teóricos e nunca chama rede), este cluster
representa operações reais, monta requests reais e — **somente quando
explicitamente habilitado** — executa chamadas reais à Supabase Management
API.

## Onde vive

```
lib/provisioning-adapters/providers/
  supabase-real.ts                 orquestração (dry-run + execução real) + ponte pra ProvisioningProviderAdapter
  supabase-real-operations.ts      catálogo das 8 operações + classificação
  supabase-real-types.ts           request/result específicos de execução real
  supabase-real-gate.ts            REAL_PROVISIONING_ENABLED
  supabase-real-idempotency.ts     chave de idempotência
  supabase-real-retry.ts           política de retry
  supabase-real-rollback.ts        rollback preview
  supabase-real-control-plane.ts   eventos de operação (Control Plane Persistence)
  supabase-client.ts               cliente HTTP mínimo (Management API)
  supabase-api.ts                  chamadas tipadas (listProjects/getProject)
  supabase-mapper.ts               resposta crua → output seguro
  supabase-errors.ts               erros estruturados
  supabase-validation.ts           validação de request/input
```

**Nenhum destes arquivos é exportado pelo barrel padrão**
(`lib/provisioning-adapters/index.ts` → `providers/index.ts`) nem registrado
em `createDefaultProvisioningAdapterRegistry()`. Esse registry default
precisa continuar seguro de importar de qualquer lugar sem tocar
`process.env`/rede (documentado em `lib/provisioning-adapters/index.ts`) — e
colidiria com o provider `"supabase"` já registrado (só 1 adapter por
provider, ver `registry.ts`). Quem quiser o Real Supabase Adapter importa
direto de `@/lib/provisioning-adapters/providers/supabase-real` e monta a
própria instância via `createRealSupabaseProvisioningAdapter(deps)` — mesma
doutrina de "nunca singleton global" já documentada em `registry.ts`.

## As 8 operações e suas classificações

| Operação | Classificação | Real nesta etapa? |
|---|---|---|
| `project.validate` | `real_supported` | sim — GET (token válido / acesso ao projeto) |
| `project.read` | `real_supported` | sim — GET `/v1/projects/{ref}` |
| `project.status` | `real_supported` | sim — mesma chamada de `project.read` |
| `project.create` | `dry_run_only` | **não** — só prepara/valida o request, mesmo com o gate ligado |
| `database.prepare` | `planned` | não |
| `auth.configure` | `planned` | não |
| `storage.prepare` | `planned` | não |
| `edge_functions.prepare` | `planned` | não |

Ver `docs/providers/supabase/operations.md` pro detalhe de cada uma.

## As 3 camadas de proteção antes de qualquer chamada real

1. **Gate** — `REAL_PROVISIONING_ENABLED=true` (default `false`). Ver
   `docs/providers/supabase/security.md`.
2. **Classificação** — só `real_supported` executa de verdade. `project.create`
   fica bloqueado mesmo com o gate ligado (decisão desta etapa, não um bug).
3. **Credencial** — resolvida exclusivamente via `withProviderCredential()`
   (Provider Credentials Runtime). Ver `docs/providers/supabase/credentials.md`.

## Integração

- **Provisioning Adapters** — implementa o mesmo contrato
  `ProvisioningProviderAdapter` do blueprint dry-run (reuso, não duplicação).
- **Provider Credentials Runtime** — toda resolução de segredo passa por
  `withProviderCredential()`; o adapter nunca lê `vault_key`/token direto.
- **Control Plane Persistence** — cada chamada real emite eventos
  `provider_operation.{requested,started,completed,failed,blocked}` em
  `control_plane_operation_events` (vocabulário aberto, sem migration) +
  `api_audit_log` (via `recordOperationEvent`).

## O que NÃO faz nesta etapa

- Não cria projeto Supabase nenhum (`project.create` é `dry_run_only`).
- Não aplica baseline/RLS/config real (`database.prepare`, `auth.configure`,
  `storage.prepare`, `edge_functions.prepare` são `planned`).
- Não executa rollback nenhum (só preview).
- Não roda contra a Supabase Management API real em CI/teste/CLI — tudo
  `fetch` mockado.
