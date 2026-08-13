---
type: architecture
status: v1 — fundação (sem provider real, sem vault real)
last_updated: 2026-08-13
---

# Provider Credentials Runtime

> Camada runtime que resolve uma `secretReferenceId` num valor de segredo
> **só em memória, pelo menor tempo possível, dentro de um boundary
> controlado** — sem nunca expor esse valor ao domínio, UI, logs ou banco.
> Constrói em cima de `lib/control-plane-persistence` (Control Plane
> Persistence + Credentials Vault). Ver `docs/architecture/brighter-platform.md`
> pro mapa completo entre fundações.

## O que esta fase é

A resposta ao gap #1 documentado em
`docs/control-plane-persistence/runtime-boundary.md`: até aqui, o
`CredentialsVault` só resolvia **metadata** (`resolveReferenceMetadata`) —
nenhum código do repo tinha um caminho de referência → valor. Esta fase
adiciona esse caminho, com:

- **Vault provider contract** (`RuntimeVaultProvider`) separado do
  `CredentialsVault` de persistência — resolve VALOR, nunca metadata.
- **3 providers desta fase**: `NoopRuntimeVaultProvider` (sempre falha),
  `InMemoryRuntimeVaultProvider` (valor fake semeado em teste/simulação),
  `EnvironmentRuntimeVaultProvider` (lê `process.env`, desabilitado por
  padrão, só prefixo `BRIGHTER_RUNTIME_` permitido).
- **Policy engine** (`evaluateProviderCredentialAccess`) — default-deny,
  cruza tenant/installation/provider/secret reference/provider connection/
  purpose/operation.
- **Lease** (`CredentialLease`) — ciclo de vida da concessão de acesso
  (`created → active → consumed → released`, mais `expired`/`revoked`/
  `failed`), single-use por padrão.
- **Runtime execution boundary** (`withProviderCredential`) — único ponto de
  entrada; a credencial NUNCA escapa do callback (detecção estrutural,
  fail-closed).
- **Integração com Provisioning Adapters** — capabilities podem declarar
  `requiredCredentialPurpose`/`requiredSecretType`.

## O que esta fase NÃO é

- **Não executa nenhum provider real.** O callback de `withProviderCredential`
  nesta fase só roda operação fake/noop — nenhum HTTP real, nenhum
  Supabase/Vercel/Cloudflare/Hostinger/Evolution/WAHA/Chatwoot/SMTP/gateway.
- **Não implementa um vault real.** `EnvironmentRuntimeVaultProvider` lê env
  var sintética (testes) — não é o backend `pgp_sym_encrypt` planejado em
  `docs/control-plane-persistence/runtime-boundary.md` (item "Provider
  Credentials Runtime" nesse doc referia-se ao vault real; ESTA fase é a
  camada de orquestração/lease/policy que fica ENTRE o domínio e qualquer
  vault real futuro — o vault `pgp_sym_encrypt` continua pendente).
- **Não persiste lease em banco.** `CredentialLeaseRepository` só tem
  implementação in-memory nesta fase — nenhuma migration foi aplicada.
- **Não adiciona tela de inserir credencial.** Admin UI é 100% read-only.

## Onde cada peça mora

| Peça | Path |
|---|---|
| Tipos/vocabulário | `lib/provider-credentials-runtime/types.ts` |
| Erros | `lib/provider-credentials-runtime/errors.ts` |
| Validação estrutural do request | `lib/provider-credentials-runtime/validation.ts` |
| Sanitização específica do runtime | `lib/provider-credentials-runtime/sanitization.ts` |
| Registry de vault providers | `lib/provider-credentials-runtime/registry.ts` |
| Vault providers (Noop/InMemory/Environment) | `lib/provider-credentials-runtime/providers/` |
| Policy engine | `lib/provider-credentials-runtime/policy.ts` |
| Resolução metadata→valor | `lib/provider-credentials-runtime/resolver.ts` |
| Lease (lifecycle + repository) | `lib/provider-credentials-runtime/lease.ts`, `repository.ts` |
| Audit | `lib/provider-credentials-runtime/audit.ts` |
| Runtime boundary | `lib/provider-credentials-runtime/runtime.ts` |
| Fábrica de dependências | `lib/provider-credentials-runtime/factory.ts` |
| Integração com Provisioning Adapters | `lib/provider-credentials-runtime/adapter-integration.ts` |
| View model pro Control Plane | `lib/provider-credentials-runtime/control-plane-integration.ts` |
| Cenários de simulação | `lib/provider-credentials-runtime/simulation.ts` |
| Summary | `lib/provider-credentials-runtime/summary.ts` |
| Admin UI (read-only) | `app/app/settings/control-plane/credentials-runtime/page.tsx` |
| CLI | `scripts/credentials-runtime-summary.ts` (`pnpm credentials:runtime`) |

## Fluxo completo

```
ProviderCredentialRequest (tenantId, installationId, provider, secretReferenceId, purpose, operation, correlationId)
  → withProviderCredential()
      → validateProviderCredentialRequest (forma)
      → audit: credential_access_requested
      → resolve secretReference (CredentialsVault.resolveReferenceMetadata — metadata só)
      → resolve providerConnection + installation (repositories já persistidos)
      → evaluateProviderCredentialAccess (policy — default deny)
          ├─ negado → audit: credential_access_denied → lança ProviderCredentialAccessDeniedError
          └─ permitido → segue
      → createCredentialLease (status: created) → audit: credential_lease_created
      → activateCredentialLease (status: active)
      → resolver.resolveSecretValue → RuntimeVaultProviderRegistry.resolveProviderForVault → provider.resolveSecret
      → audit: credential_resolved (nunca o valor)
      → callback(ResolvedCredential) — operação fake/noop nesta fase
      → detecção de escape (containsResolvedCredential no retorno) — lança se detectado
      → consumeCredentialLease → audit: credential_consumed
      → finally: credential.release() (zera buffer) + releaseCredentialLease (idempotente) → audit: credential_released (só se mudou de estado)
```

A credencial NUNCA é retornada por `withProviderCredential` — só o
resultado do callback, e mesmo esse resultado é varrido em busca de um
`ResolvedCredential` embutido antes de sair.

## Como ler os outros docs

1. `security.md` — princípios de segurança, o que nunca é persistido/logado.
2. `leases.md` — ciclo de vida da `CredentialLease`, transições válidas.
3. `policies.md` — o policy engine, default-deny, cada blocker.
4. `vault-providers.md` — os 3 providers desta fase, o que cada um resolve.
5. `adapter-integration.md` — como um Provisioning Adapter declara requisito.
6. `runtime-boundary.md` — a linha exata entre esta fase e fases futuras.
7. `simulation.md` — os 11 cenários, `pnpm credentials:runtime`.
