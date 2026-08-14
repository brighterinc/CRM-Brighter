---
type: reference
status: v1
last_updated: 2026-08-13
---

# Real Supabase Adapter — Segurança

## Gate — `REAL_PROVISIONING_ENABLED`

- Default: **`false`**. Sem essa env var setada como `"true"` (string exata,
  case-sensitive), toda tentativa de execução real falha com
  `RealProvisioningDisabledError` — reusado de
  `lib/provisioning-adapters/types.ts`, nunca duplicado.
- Lido direto de `process.env` em `supabase-real-gate.ts`, **nunca** via
  `lib/env.ts` no caminho quente (mesmo cuidado documentado em
  `control-plane-persistence/services.ts` — importar `lib/env.ts` valida TODA
  env crítica na hora do import e quebraria CLI/teste sem `.env`). O mesmo
  nome/semântica é espelhado em `lib/env.ts` só pra documentação/boot da app.
- Dry-run **funciona com o gate desligado** — nunca toca rede, nunca resolve
  credencial.

## Classificação por operação — segunda camada, independente do gate

`project.create` fica `dry_run_only` **mesmo com o gate ligado**. Se alguém
tentar `executeReal("project.create")`, o adapter lança
`SupabaseOperationNotRealSupportedError` — erro estruturado distinto do erro
de gate, porque é uma fronteira de escopo desta etapa, não uma política de
segurança do gate. Nenhum projeto Supabase é criado por este código nesta
etapa, sob nenhuma condição.

## Credencial — boundary único

Toda chamada real passa por `withProviderCredential()`
(`lib/provider-credentials-runtime/runtime.ts`). O Real Supabase Adapter:

- **nunca** lê `vault_key`/token direto de um repository;
- **nunca** guarda o token em campo de instância — o `SupabaseManagementClient`
  recebe o token só como parâmetro por chamada;
- extrai o valor via `credential.use(v => v)` **uma única vez**, dentro do
  callback de `withProviderCredential` (nunca retornado por esse callback —
  isso dispararia `CredentialEscapeAttemptError`), e reusa esse valor local
  pras tentativas de retry (`ResolvedCredential.use()` é single-use — chamar
  de novo por tentativa lançaria `CredentialAlreadyConsumedError`).

## Nunca logado / nunca retornado

- `SupabaseManagementClient.request()` nunca loga `Authorization` nem body —
  só `requestId`/`correlationId` em headers de rastreio.
- Erros estruturados (`supabase-errors.ts`) carregam status HTTP + `requestId`
  — nunca o header de auth nem o corpo bruto da resposta de erro.
- Eventos de operação (`supabase-real-control-plane.ts`) registram só
  `provider`, `operation`, `correlation_id` e, em falha, o **nome da classe**
  do erro (`error_code`, ex. `"SupabaseRateLimitError"`) — nunca a mensagem
  bruta, nunca o corpo da resposta.
- `sanitizeDeep` (`lib/tenants/export.ts`, reusada em toda a Foundation) roda
  sobre todo `output`/`input` antes de sair — remove recursivamente qualquer
  chave que bata `password|token|api[_-]?key|secret|...`.

## Retry — só erros seguros

Retry (`supabase-real-retry.ts`) só acontece em timeout, 429 e um
subconjunto de 5xx (502/503/504). **Nunca** em 400/401/403/404/409 — erro de
validação/autorização/conflito lógico não se resolve tentando de novo.
`maxAttempts` bounded (default 3) — sem loop infinito.

## Idempotência — nunca inclui segredo

A chave (`supabase-real-idempotency.ts`) é um hash SHA-256 de
`{ provider, tenantId, installationId, operation, sanitizeDeep(input) }` —
`input` sempre sanitizado antes de entrar no hash, então mesmo que alguém
coloque um campo com nome sensível em `input` por engano, ele nunca entra na
chave.

## Checklist de segurança desta etapa (confirmado)

- [x] Execução real desabilitada por default
- [x] Nenhum secret real armazenado por este código
- [x] Nenhum secret logado
- [x] Nenhum secret retornado
- [x] Nenhuma migration aplicada por esta feature (só um `readonly string[]`
      de vocabulário aberto somado em `control-plane-persistence/types.ts`)
- [x] Nenhum projeto Supabase criado
- [x] Nenhuma chamada real feita nesta sessão (testes/CLI 100% `fetch` mockado)
- [x] Nenhum Docker/deploy/alteração na Lumina
