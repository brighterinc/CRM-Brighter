---
type: architecture
status: v1
last_updated: 2026-08-13
---

# Segurança — Provider Credentials Runtime

## Princípio: fail-closed em toda camada

Nenhuma camada desta runtime faz "allow by default". Se qualquer dependência
(secret reference, provider connection, installation) não é encontrada, ou
qualquer checagem falha, o resultado é negação — nunca omissão silenciosa
virando aprovação. Ver `policies.md`.

## Ciclo de vida do valor de segredo em memória

1. `RuntimeVaultProvider.resolveSecret()` cria um `ResolvedCredential` — o
   valor vive num `Buffer` privado de VERDADE (campo `#buffer`, privacidade
   nativa do motor JS — não é `private` do TypeScript, que é só apagado em
   compile-time e ainda vira propriedade own enumerável em runtime).
2. Não existe getter de valor. Único acesso é `.use(fn)`, que entrega o
   valor ao callback e IMEDIATAMENTE marca consumo (se a lease é single-use,
   uma segunda chamada lança `CredentialAlreadyConsumedError`).
3. `.release()` zera o buffer (`fill(0)`) e marca liberado — idempotente,
   chamado sempre em `finally` por `withProviderCredential`, mesmo se o
   callback lançar.
4. `toJSON()` e `[util.inspect.custom]` nunca retornam o valor — um
   `console.log(credential)` ou `JSON.stringify({ credential })` de boa-fé
   não vaza nada (retornam a string literal `"[ResolvedCredential redacted]"`).

## O que nunca é persistido/logado/exibido

Confirmado por teste (`tests/unit/provider-credentials-runtime-*.test.ts`):

- Valor de segredo nunca aparece em `JSON.stringify` de um evento de audit.
- Valor de segredo nunca aparece em `console.log`/`console.error` — nenhuma
  função desta camada usa `console.*`.
- Valor de segredo nunca é retornado por `withProviderCredential` — só o
  resultado do callback.
- `CredentialLease` nunca guarda o valor — só `secretReferenceId` (ponteiro).
- Summary (`summary.ts`) e admin UI nunca mostram `vaultKey`/valor.

## Detecção de escape estrutural

`containsResolvedCredential()` (`types.ts`) varre recursivamente qualquer
objeto/array em busca de um `ResolvedCredential` embutido, usando um Symbol
sentinela não-exportado — funciona mesmo que o wrapper esteja debaixo de uma
chave de nome inocente (o que um denylist só-por-nome-de-chave não pegaria).
Dois consumidores:

1. `withProviderCredential` — se o retorno do callback contém o
   `ResolvedCredential`, lança `CredentialEscapeAttemptError` (a operação
   inteira falha, não só o vazamento é mascarado).
2. `sanitization.ts::assertNoEmbeddedCredential` — usado por `summary.ts`
   antes de formatar qualquer saída.

## Duas funções de sanitização, dois propósitos

- `assertNoCredentialLeak(payload, context)` — denylist de nome de chave
  (reusa `sanitizeDeep`/`findSensitiveKeyPaths` de `lib/tenants/export.ts`,
  fonte única — nunca duplicado) **+** checagem estrutural. Lança
  `CredentialLeakDetectedError` com os dot-paths ofensivos — nunca mascara
  em silêncio. Usada em fronteiras de `Record<string, unknown>` solto (ex.:
  metadata de audit event).
- `assertNoEmbeddedCredential(payload, context)` — só a checagem estrutural,
  sem denylist de nome de chave. Existe porque tipos legítimos desta camada
  usam nomes de campo como `secretReferenceId`/`secret_type` que CASAM o
  denylist genérico (`SENSITIVE_KEY_PATTERN` casa qualquer chave que
  CONTENHA "secret", não só valor de segredo) sem jamais carregar um valor
  de verdade — o tipo já garante isso em compile-time. Usada em `summary.ts`,
  que formata objetos já tipados e conhecidos como seguros por construção.

**Consequência prática**: nomes de campo/metadata desta camada NUNCA usam a
palavra `secret` como substring (ex.: evento `credential_resolved` usa a
chave `type`, nunca `secret_type`) — mesma convenção já usada em
`lib/control-plane-persistence/services.ts::recordSecretReference`.

## Auditoria — reusa o canal existente, nunca duplica

`audit.ts::recordProviderCredentialAuditEvent` grava em
`control_plane_operation_events` via `recordOperationEvent()`
(`lib/control-plane-persistence/services.ts`) — mesmo canal, mesma tabela,
mesma doutrina de "append-only, sem RLS de update/delete". Novos
`eventType` (`PROVIDER_CREDENTIALS_RUNTIME_EVENT_TYPES`) somam ao
vocabulário ABERTO já existente (`CONTROL_PLANE_OPERATION_EVENT_TYPES`) —
sem migration.

`ProviderCredentialAuditSink` é injetado (mesmo padrão de `AuditEmitter` em
`services.ts`): CLI/teste/simulação passam um `emitAudit` no-op via
`actorContext`, nunca importam `@/lib/audit`/`lib/env.ts` estaticamente.

## `EnvironmentRuntimeVaultProvider` — allowlist, nunca leitura livre

Nasce **desabilitado** (`enabled: false` default). Mesmo habilitado, só
resolve env vars cujo nome comece com um prefixo configurado (default
`BRIGHTER_RUNTIME_`) — nunca vira um jeito de ler qualquer variável do
processo host. `vaultKey` de uma `SecretReferenceMetadata` resolvida por
este provider é interpretado como o NOME da env var, nunca o valor. Testes
usam env sintética, setada e restaurada dentro do próprio teste — `.env`
real nunca é tocado.

## O que NÃO está coberto nesta fase

- Vault real (`pgp_sym_encrypt`/backend de criptografia) — pendente, ver
  `runtime-boundary.md`.
- Persistência de lease em banco — só in-memory nesta fase.
- Rate limit — sem rota `/api/v1/` pública nesta fase.
- Gate de aprovação humana antes de resolver credencial — nenhuma ação
  destrutiva real existe ainda pra aprovar (mesma observação já registrada
  em `docs/control-plane-persistence/runtime-boundary.md`).
