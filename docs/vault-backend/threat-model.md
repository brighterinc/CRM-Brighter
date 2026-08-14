---
type: architecture
status: v1 — não aplicado
last_updated: 2026-08-14
---

# Threat Model — Real Vault Backend

> As 18 ameaças pedidas na tarefa, uma a uma. "Mitigado" = a defesa existe em
> código/schema HOJE nesta branch. "Documentado, não testado contra banco
> real" = a defesa existe em código/schema, mas `pnpm test:db` não rodou
> nesta sessão (Docker fora de escopo — ver `docs/vault-backend/migration-plan.md`).

## 1. Database dump comprometido

**Mitigado.** O dump contém `control_plane_secret_ciphertexts.ciphertext`
(bytea `pgp_sym_encrypt`), nunca plaintext. Sem a chave mestra (que NUNCA
vive no banco — `private.app_secrets`/GUC são infra operacional, não dado
de aplicação, e o dump lógico do schema `public` não inclui `private` por
padrão de `pg_dump --schema=public`), o ciphertext é inútil. Mesmo um dump
que INCLUÍSSE `private.app_secrets` ainda precisaria da GUC
`app.brighter_vault_key` (que tem precedência sobre a tabela) estar
ausente/vazia pra não vazar — recomendação operacional: manter a chave só
na GUC do processo Postgres (`ALTER DATABASE ... SET`), nunca na tabela, em
produção (ver `operational-runbook.md`).

## 2. Cross-tenant access

**Mitigado, em DUAS camadas independentes:**
- **Policy** (`lib/provider-credentials-runtime/policy.ts`,
  `evaluateProviderCredentialAccess` — inalterada por esta fase): nega se
  `secretReference.tenantId !== request.tenantId`, mesmo com uma
  `ProviderConnection` "válida" apontando errado (provado por
  `scenarioCrossTenant`/teste "isolamento cross-tenant continua negado").
- **RLS** (migration 0098, inalterada): `control_plane_secret_references`
  só é visível/editável por `fn_is_platform_admin()` — não há RLS
  per-tenant porque Control Plane não é dado de `organizations` (ver
  `docs/control-plane-persistence/rls.md`).

Esta fase NÃO reimplementa a policy — só pluga um `RuntimeVaultProvider` a
mais no MESMO boundary (`withProviderCredential`), então herda a garantia
de graça.

## 3. Compromised browser

**Mitigado por desenho.** O valor nunca sai do backend Node — a UI
(`/app/settings/control-plane/credentials-runtime`, inalterada nesta fase)
só lê `SecretReferenceMetadata`/`ProviderCredentialReadiness`, nunca
`ciphertext`. Não existe rota `/api/v1/` que devolva `ciphertext`/plaintext
(nenhuma foi criada nesta fase). Um browser comprometido no MÁXIMO vê o que
a UI já mostra: metadata.

## 4. Malicious platform user (platform-admin com credencial roubada/insider)

**Parcialmente mitigado, por desenho explícito.** Platform-admin PODE:
listar/criar/rotacionar/revogar REFERÊNCIAS (`control_plane_secret_references`,
RLS `fn_is_platform_admin()`) — isso é intencional, é a superfície
administrativa. Platform-admin NÃO PODE: ler `ciphertext`
(`control_plane_secret_ciphertexts` tem ZERO policies RLS, nem para
platform-admin) nem chamar `fn_vault_decrypt_secret` (REVOKE ALL FROM
PUBLIC, GRANT só a `service_role` — nenhum papel autenticado via
browser/JWT tem esse grant). Um platform-admin malicioso PODE revogar/
rotacionar referências de outros clientes (dano operacional, auditável via
`control_plane_operation_events`+`api_audit_log`) mas não PODE extrair o
valor — precisaria de acesso a `service_role` (equivalente a comprometer o
próprio backend, fora do escopo deste threat model específico).

## 5. Accidental logging

**Mitigado, várias camadas:**
- `assertNoCredentialLeak`/`assertSafePersistencePayload` (já existentes,
  reusados sem mudança) rodam em toda fronteira de audit/operation-event
  desta fase (`storeSecretValue`/`rotateSecretValue`/`revokeSecretValue`
  chamam `assertSafePersistencePayload` no `eventMetadata`).
- `secret-value-service.ts` NUNCA loga `newPlaintext`/`ciphertext` — só
  `version`/`encryption_scheme` (nunca a chave, nunca o byte).
- `PostgresPgcryptoRuntimeVaultProvider` NUNCA loga `plaintext` — o valor só
  existe dentro do `ResolvedCredential` (buffer privado real, `toJSON()`
  redigido).
- `PgcryptoSecretEncryptionProvider`/`SupabaseVaultCryptoRpcClient` nunca
  logam request/response do RPC.

## 6. Secret returned by API

**Mitigado.** Nenhuma rota `/api/v1/` foi criada nesta fase. `CredentialsVault`
continua sem `getSecretValue()`. `SecretPayloadRepository.getActiveCiphertext`
(o único método que devolve `ciphertext`) é chamado só por
`PostgresPgcryptoRuntimeVaultProvider.resolveSecret` — nunca por um
handler HTTP.

## 7. Secret embedded in error

**Mitigado.** `SecretEncryptionFailedError`/`SecretDecryptionFailedError`
(`vault/encryption.ts`) NUNCA incluem plaintext/ciphertext na mensagem — só
`providerId` + descrição textual do tipo de falha (ex.: "chave errada ou
ciphertext corrompido"). `SecretVersionStaleError` inclui só números de
versão (nunca valor). Testado em
`tests/unit/vault-backend-encryption.test.ts`.

## 8. Secret embedded in audit

**Mitigado.** `storeSecretValue`/`rotateSecretValue` só colocam
`{type, provider, version, encryption_scheme}` no `metadata` do audit/
operation-event — nunca `ciphertext`/`plaintext`. Testado explicitamente em
`tests/unit/vault-backend-service.test.ts` ("emite audit e operation event
SEM o plaintext em nenhum campo").

## 9. SQL injection impact

**Mitigado por desenho.** Todo acesso ao Postgres passa por
`@supabase/supabase-js` (PostgREST + RPC parametrizado) — nenhuma
concatenação de string SQL em nenhum ponto desta fase. As 3 funções SQL
novas (`fn_vault_encrypt_secret`/`fn_vault_decrypt_secret`/
`fn_vault_write_secret_version`/`fn_vault_revoke_secret`) recebem parâmetros
tipados (`text`, `bytea`, `uuid`) via `$$ ... $$` plpgsql com bind
parameters do próprio Postgres — nunca `EXECUTE` de string montada.

## 10. Replay

**Parcialmente mitigado, herdado.** `withProviderCredential` já impõe
`CredentialLease` single-use por padrão (não desta fase) — uma credencial
resolvida não pode ser "reusada" pelo MESMO caller através do boundary sem
nova lease. Esta fase não adiciona nonce/replay-window na CAMADA DE
CRIPTOGRAFIA (`pgp_sym_encrypt` não é autenticado contra replay de
ciphertext — decifrar o MESMO ciphertext duas vezes sempre funciona,
símétrico). Isso é aceitável: replay de ciphertext armazenado não é uma
ameaça nova introduzida por este backend (é a mesma propriedade de
`fn_encrypt_oauth`/`fn_decrypt_oauth` já em produção desde a migration
0006) — o controle de replay relevante é a nível de aplicação
(idempotency key, já existente na doutrina do CLAUDE.md), não de
criptografia at-rest.

## 11. Stale credential

**Mitigado — `SecretVersionStaleError`.** `PostgresPgcryptoRuntimeVaultProvider.resolveSecret`
compara `activeVersion.version` (payload) contra `reference.version`
(metadata) e recusa fail-closed se divergirem — nunca "usa a que achar".
Testado em `tests/unit/vault-backend-runtime-provider.test.ts`.

## 12. Revoked credential

**Mitigado, DUAS camadas.** `resolver.ts` (inalterado) já recusa ANTES de
chamar o provider se `metadata.status !== "active"`. `revokeSecretValue`
também marca a versão ativa do CIPHERTEXT como `"revoked"` — mesmo se
alguém pulasse a checagem de metadata, `getActiveCiphertext` não encontraria
nenhuma versão `"active"` e `resolveSecret` lançaria
`SecretResolutionFailedError("reference_not_found", ...)`.

## 13. Rotated credential

**Mitigado — versionamento first-class.** Rotação nunca faz `UPDATE` no
lugar — supersede a versão ativa (`status: "superseded"`, `supersededAt`
carimbado) e insere uma nova `"active"`. `getActiveCiphertext` sempre
resolve a versão mais recente `"active"`. Testado em
`tests/unit/vault-backend-secret-payload-repository.test.ts`.

## 14. Provider mismatch

**Mitigado, herdado da policy existente** (`secretReference.provider !==
request.provider` → `blockers.push("provider_mismatch")`). Esta fase não
muda essa lógica — só prova que o novo `vaultProvider: "postgres_pgcrypto"`
não contorna a checagem (cenário `wrong-provider` de
`pnpm vault:simulate`).

## 15. secretType mismatch

**Mitigado, herdado.** `adapterRequirement.secretType !== secretReference.type`
→ `blockers.push("secret_type_mismatch")` (policy inalterada). Provado pelo
cenário `wrong-secret-type` (referência `api_key` vs. operação que exige
`database_password`).

## 16. Purpose mismatch

**Mitigado, herdado.** `adapterRequirement.purpose !== request.purpose` →
`blockers.push("purpose_not_authorized")`. Provado pelo cenário
`wrong-purpose`.

## 17. Concurrent rotation

**Mitigado no nível do PAYLOAD (a parte que carrega o segredo).**
`fn_vault_write_secret_version` (SQL) faz `SELECT ... FOR UPDATE` na
`control_plane_secret_references` pai ANTES de ler/escrever
`control_plane_secret_ciphertexts` — serializa concorrência real no
Postgres: a segunda chamada só lê "próxima versão" depois que a primeira
commitou. `InMemorySecretPayloadRepository` replica isso com um mutex por
`secretReferenceId`. **Limitação documentada:** o bump de
`control_plane_secret_references.version` feito por
`rotateSecretReference`/`DatabaseSecretReferenceRepository.rotateReference`
(migration 0098, NÃO tocada por esta fase) usa leitura-then-escrita em duas
etapas SEM lock — sob concorrência real de banco, é teoricamente sujeito a
"lost update" no CAMPO DE METADATA (não no ciphertext, que é a parte
sensível). `rotateSecretValue` evita chamar esse caminho quando o backend
real já bumpou a metadata dentro da MESMA transação da RPC (ver comentário
em `secret-value-service.ts::rotateSecretValue`) — a exposição real fica
restrita ao caso in-memory de teste. Corrigir a race de
`DatabaseSecretReferenceRepository.rotateReference` em geral (ex.: via um
`UPDATE ... SET version = version + 1` atômico) é trabalho FUTURO, fora do
escopo desta fase (não introduzido por ela, pré-existente desde 0098) — ver
`docs/vault-backend/migration-plan.md` §"Limitações conhecidas".

## 18. Deletion/history implications

**Mitigado por desenho.** `on delete cascade` de
`control_plane_secret_ciphertexts.secret_reference_id` →
`control_plane_secret_references(id)`: apagar uma reference apaga seu
histórico de ciphertext (correto — não faz sentido reter ciphertext órfão
sem metadata que diga o que ele é). `control_plane_secret_references` em si
usa `on delete set null` a partir de `installations`/`tenants` (herdado de
0098) — apagar uma installation NUNCA apaga em silêncio uma reference
(preserva rastro de auditoria, evita "cascade fantasma", anti-padrão nº7 do
CLAUDE.md). Revogação é preferida a deleção — `revokeSecretValue` marca
`"revoked"`, nunca `DELETE`.
