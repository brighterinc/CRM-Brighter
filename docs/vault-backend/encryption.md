---
type: architecture
status: v1 — não aplicado
last_updated: 2026-08-14
---

# Encryption — Real Vault Backend

## Por que Postgres `pgp_sym_encrypt`, não outra coisa

Avaliado e descartado antes de implementar (per instrução explícita da
tarefa: "NÃO escolha implementação criptográfica só porque estou sugerindo"):

| Opção | Por que não, agora |
|---|---|
| KMS externo (AWS/GCP) | Acopla o self-host a um provedor cloud específico — quebra a doutrina "self-host em VPS" do CLAUDE.md. Vira opção via `SecretEncryptionProvider` FUTURA, não obrigatória. |
| Vault externo (HashiCorp) | Mais um serviço pra instalar/operar numa VPS já rodando WAHA/Redis/Postgres — custo operacional alto pro ganho, nesta fase. |
| Criptografia em Node (`crypto` nativo) | Moveria a chave mestra pro processo Node (env var), que é exatamente o padrão que `NUVEMSHOP_OAUTH_ENCRYPTION_KEY`/`fn_encrypt_oauth` já EVITAM — chave em `.env` vaza mais fácil (logs de deploy, dump de processo) que uma GUC de Postgres. |
| Postgres `pgp_sym_encrypt` | **Escolhido.** Já é o padrão em produção pro OAuth do Nuvemshop (migration 0006) — mesma infra operacional, mesmo runbook de "onde a chave vive", zero serviço novo pra instalar. Decifrar acontece DENTRO do Postgres, nunca no processo Node — o backend só recebe o resultado já em texto claro via RPC autenticado (`service_role`). |

`pgp_sym_encrypt`/`pgp_sym_decrypt` usam `cipher-algo=aes256` (mesmo
parâmetro do Nuvemshop) — AES-256 simétrico, OpenPGP framing (inclui MDC —
Modification Detection Code — por padrão no `pgcrypto` do Postgres, que
detecta boa parte de adulteração de ciphertext, embora não seja um AEAD
formal como AES-GCM).

## A abstração `SecretEncryptionProvider`

```typescript
interface SecretEncryptionProvider {
  readonly id: string;
  encrypt(plaintext: string): Promise<EncryptedSecretPayload>;
  decrypt(payload: Pick<EncryptedSecretPayload, "ciphertext" | "encryptionScheme" | "keyId">): Promise<string>;
  healthPreview(): Promise<SecretEncryptionProviderHealth>;
}
```

Deliberadamente separada de `RuntimeVaultProvider` — esta interface só sabe
cifrar/decifrar, nunca sabe de tenant/policy/lease.
`PostgresPgcryptoRuntimeVaultProvider` (o `RuntimeVaultProvider` real)
DELEGA pra um `SecretEncryptionProvider` injetado — trocar o backend de
criptografia no futuro (KMS, Vault externo) é trocar SÓ a implementação
injetada, sem tocar `PostgresPgcryptoRuntimeVaultProvider` nem qualquer
código acima dele no boundary.

`encryptionScheme`/`keyId` no payload preparam evolução SEM migração de
dado: hoje sempre `"pgcrypto_aes256"`/`"default"`, mas o formato já suporta
múltiplas chaves convivendo (ver "Rotação de chave mestra" abaixo).

## As 2 implementações

| Classe | Arquivo | Uso |
|---|---|---|
| `FakeSecretEncryptionProvider` | `vault/encryption-fake.ts` | Teste/simulação — XOR reversível, NUNCA criptografia real. `corruptNextCiphertext()` simula ciphertext corrompido. |
| `PgcryptoSecretEncryptionProvider` | `vault/encryption-pgcrypto.ts` | Real — chama `fn_vault_encrypt_secret`/`fn_vault_decrypt_secret` via `VaultCryptoRpcClient` (interface injetável, `SupabaseVaultCryptoRpcClient` é a implementação real). |

## Chave mestra — onde ela vive

`private.fn_vault_key()` (SQL, `SECURITY DEFINER`, `search_path` fixo):

```sql
select coalesce(
  nullif(current_setting('app.brighter_vault_key', true), ''),
  (select value from private.app_secrets where name = 'brighter_vault_key')
);
```

1. **GUC `app.brighter_vault_key`** (via `ALTER DATABASE ... SET` — não
   funciona em Supabase cloud gerenciado, que bloqueia `ALTER DATABASE/ROLE
   SET` de GUC custom com erro `42501`) — tem PRECEDÊNCIA quando setada.
2. **Fallback: `private.app_secrets`** (tabela genérica key-value, já
   existe desde a migration 0041 pro Nuvemshop — reusada aqui como infra,
   NUNCA como segredo compartilhado) — linha `name = 'brighter_vault_key'`.

`private` schema tem `REVOKE ALL FROM PUBLIC` em schema E tabelas — só
funções `SECURITY DEFINER` (rodando como dono, tipicamente `postgres`) leem.
Nenhum client comum (mesmo `service_role`) consegue `SELECT * FROM
private.app_secrets` diretamente.

## Nunca reusa `fn_encrypt_oauth`/`fn_decrypt_oauth`

Doutrina explícita do ROADMAP. `fn_vault_encrypt_secret`/
`fn_vault_decrypt_secret` são funções PRÓPRIAS, com `private.fn_vault_key()`
PRÓPRIA (nunca `private.fn_oauth_key()`), linha PRÓPRIA em
`private.app_secrets` (`brighter_vault_key`, nunca `nuvemshop_oauth_key`).
Motivo: são domínios de segredo INDEPENDENTES — OAuth de app de cliente
(Nuvemshop) vs. credencial de provisionamento White Label (Control Plane).
Compartilhar a chave acoplaria o ciclo de vida/rotação de um ao do outro
sem necessidade nenhuma.

## Rotação de chave mestra (preparado, não implementado)

`key_id` em `control_plane_secret_ciphertexts` identifica qual chave
cifrou aquele payload específico. Hoje sempre `"default"` (uma única
chave). Uma rotação de CHAVE MESTRA futura seguiria: (1) nova chave vira a
ativa em `private.fn_vault_key()` sob um `key_id` novo, (2) job de
background decifra cada `ciphertext` com a chave antiga (`key_id` antigo) e
recifra com a nova, atualizando `key_id` da linha — sem precisar de
downtime, linha por linha. Nenhum código desta fase faz isso — é só o
formato de dado que já comporta, pra não exigir migração de schema quando
chegar a vez.

## Diferença entre rotação de SEGREDO e rotação de CHAVE MESTRA

- **Rotação de segredo** (`rotateSecretValue`, implementada nesta fase):
  troca o VALOR guardado (ex.: token do Supabase expirou, gera um novo) —
  nova VERSÃO na mesma reference, mesma chave mestra.
- **Rotação de chave mestra** (preparada, não implementada): troca a CHAVE
  usada pra cifrar — mesmo valor, novo `key_id`, sem mudar `version`.
