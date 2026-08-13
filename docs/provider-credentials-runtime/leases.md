---
type: architecture
status: v1 — só in-memory (sem tabela persistida)
last_updated: 2026-08-13
---

# Credential Lease

> Controla POR QUANTO TEMPO/QUANTAS VEZES uma credencial resolvida pode ser
> usada — independente do `ResolvedCredential` em si (defesa em
> profundidade: mesmo se algo chamar `.use()` do wrapper diretamente sem
> passar pelo runtime, a lease ainda impõe estado).

## Status (`CredentialLeaseStatus`)

`created` · `active` · `consumed` · `released` · `expired` · `revoked` · `failed`

Os quatro últimos são **terminais** — nenhuma transição sai deles
(`isLeaseTerminal()`, `lease.ts`).

## Transições válidas

```
created  → active | expired | revoked | failed
active   → consumed | released | expired | revoked | failed
consumed → released | expired | revoked | failed
           (consumed → consumed só se singleUse: false)
released | expired | revoked | failed → (terminal, sem saída)
```

Transição fora desta tabela lança `CredentialLeaseInvalidTransitionError`
(`from`, `to` como campos estruturados do erro).

## Funções (`lease.ts`)

| Função | Efeito |
|---|---|
| `createCredentialLease(repo, input)` | Cria com status `created`. |
| `activateCredentialLease(repo, id)` | `created → active`. |
| `consumeCredentialLease(repo, id)` | Marca consumida. Lease single-use: só uma vez — segunda chamada lança `CredentialAlreadyConsumedError`. Lease multi-uso: pode repetir enquanto ativa. |
| `releaseCredentialLease(repo, id)` | Libera. **Idempotente** — chamar numa lease já terminal devolve a lease como está, nunca lança. |
| `expireCredentialLease(repo, id)` | Expira. Idempotente em terminal. |
| `revokeCredentialLease(repo, id)` | Revoga. Idempotente se já revogada. |
| `failCredentialLease(repo, id, reason)` | Marca `failed` com `failureReason`. Idempotente em terminal (não sobrescreve o motivo de uma falha anterior). |

## Por que `release`/`fail`/`expire`/`revoke` são idempotentes

`withProviderCredential` (`runtime.ts`) sempre chama `releaseCredentialLease`
no `finally`, **independente de já ter sido liberada por outro caminho**
(ex.: já marcada `failed` pelo `catch` anterior no mesmo fluxo). Se essas
funções lançassem ao repetir, o `finally` mascararia o erro original do
callback com um erro de transição de lease — inaceitável. Por isso a
liberação nunca sobrescreve um estado terminal já existente (uma lease que
falhou continua `failed`, nunca vira `released` por cima).

## Single-use — onde é imposto (duas camadas)

1. **`CredentialLease.singleUse`** (`lease.ts::consumeCredentialLease`) —
   nega uma segunda `consumeCredentialLease` na mesma lease.
2. **`ResolvedCredential.singleUse`** (`types.ts`) — nega uma segunda
   chamada de `.use()` no mesmo wrapper, mesmo que ninguém tenha chamado
   `consumeCredentialLease` ainda. Defesa em profundidade — o wrapper impõe
   a regra por conta própria, não depende só da lease estar corretamente
   ligada ao fluxo.

Ambas lançam `CredentialAlreadyConsumedError` (mesmo tipo, `types.ts`) por
consistência.

## `release-on-error`

Se o callback de `withProviderCredential` lança, o `catch` chama
`failCredentialLease(repo, leaseId, mensagem)` — a lease termina em
`failed`, nunca em `released`. O `finally` roda `releaseCredentialLease`
depois, que é um no-op nesse caso (já terminal). Provado em
`tests/unit/provider-credentials-runtime-lease.test.ts` e no cenário de
simulação `release-on-error` (`pnpm credentials:runtime -- --scenario
release-on-error`).

## Repository (`repository.ts`)

`CredentialLeaseRepository` — só `InMemoryCredentialLeaseRepository` nesta
fase (`Map` privado por instância, nunca singleton global, mesma doutrina
das demais repositories in-memory do repo). Nenhuma tabela
`control_plane_secret_leases` existe ainda — esta etapa não aplica
migration. Um backend persistido é trabalho futuro, quando o vault real
existir (ver `runtime-boundary.md`).
