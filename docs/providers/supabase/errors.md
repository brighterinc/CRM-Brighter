---
type: reference
status: v1
last_updated: 2026-08-13
---

# Real Supabase Adapter — Erros

Todos em `lib/provisioning-adapters/providers/supabase-errors.ts`, mesmo
padrão flat do resto do repo (`extends Error`, `this.name` em
`snake_case`/`PascalCase` de classe, campos estruturados `public readonly`).
Nenhum carrega `Authorization`/token/body bruto — só status HTTP, `requestId`
e detalhes já sanitizados.

| Erro | Quando | Retry? |
|---|---|---|
| `RealProvisioningDisabledError` (reusado de `../types.ts`) | Gate `REAL_PROVISIONING_ENABLED` desligado | não — nem tenta a chamada |
| `SupabaseOperationNotRealSupportedError` | Operação `dry_run_only`/`planned` chamada via `executeReal`, mesmo com gate ligado | não — nem tenta a chamada |
| `SupabaseRequestInvalidError` | Request estruturalmente inválido ou `requiredInputFields` faltando | não |
| `SupabaseCredentialInvalidError` | HTTP 401 da Management API | **não** |
| `SupabaseAccessDeniedError` | HTTP 403 | **não** |
| `SupabaseProjectNotFoundError` | HTTP 404 (carrega `projectRef`) | **não** |
| `SupabaseProjectConflictError` | HTTP 409 (conflito lógico) | **não** |
| `SupabaseRateLimitError` | HTTP 429 (carrega `retryAfterSeconds`, se o header vier) | **sim** |
| `SupabaseTimeoutError` | Timeout do `AbortController` (default 10s, configurável no client) | **sim** |
| `SupabaseApiError` | Fallback — qualquer status não mapeado acima (inclui 5xx) | sim só se 502/503/504 |

Erros de credencial (`ProviderCredentialAccessDeniedError`,
`SecretResolutionFailedError`, `CredentialLeaseInvalidTransitionError`, …) são
de `lib/provider-credentials-runtime/errors.ts` e **nunca duplicados aqui** —
o adapter deixa eles propagarem direto quando a falha é na resolução da
credencial, não na chamada HTTP em si.

## Mapeamento HTTP → erro

`mapHttpStatusToSupabaseError(status, context, extra)` — único ponto que
decide essa tradução (nunca duplicado em `supabase-client.ts`/`supabase-api.ts`).

## Retry — ver `docs/providers/supabase/security.md#retry--só-erros-seguros`

Só timeout/429/5xx-selecionado. `maxAttempts` default 3, backoff exponencial
com jitter, capado.
