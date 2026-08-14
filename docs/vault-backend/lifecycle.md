---
type: architecture
status: v1 — não aplicado
last_updated: 2026-08-14
---

# Lifecycle — Real Vault Backend

## As 7 operações pedidas

| Operação | Função | Onde |
|---|---|---|
| `createSecretReference` | `recordSecretReference` | `control-plane-persistence/services.ts` (inalterada) |
| `storeSecret` | `storeSecretValue` | `vault/secret-value-service.ts` (NOVA) |
| `resolveSecret` | `withProviderCredential` + `PostgresPgcryptoRuntimeVaultProvider` | `provider-credentials-runtime/` (runtime existente + provider novo) |
| `rotateSecret` | `rotateSecretValue` | `vault/secret-value-service.ts` (NOVA) |
| `revokeSecret` | `revokeSecretValue` | `vault/secret-value-service.ts` (NOVA) |
| `getSecretMetadata` | `resolveReferenceMetadata` | `CredentialsVault` (inalterada) |
| `listSecretReferences` | `listByInstallation` | `SecretReferenceReader` (inalterada) |
| `recordSecretUsage` | `recordSecretUsage` | `vault/secret-value-service.ts` (NOVA) |

## Por que `storeSecret`/`rotateSecret`/`revokeSecret` NUNCA entraram em `CredentialsVault`

`CredentialsVault` é deliberadamente metadata-only — "se o valor nunca pode
ser lido pelo domínio através desta interface, não tem como um chamador de
boa-fé vazá-lo sem querer" (doutrina já existente,
`docs/control-plane-persistence/credentials-vault.md`). Um `storeSecret(id,
plaintext)` na MESMA interface que a admin UI/CLI/qualquer service chama
livremente pra metadata quebraria essa garantia — qualquer código que já
importa `CredentialsVault` ganharia, sem querer, a capacidade de aceitar
plaintext. `vault/secret-value-service.ts` é um módulo SEPARADO, importado
só onde a escrita de valor é uma operação deliberada.

## Ciclo completo (feliz)

```
1. recordSecretReference(...)              → SecretReferenceMetadata { version: 1, status: "active" }
2. storeSecretValue(id, "token-abc")        → ciphertext v1 "active"
3. withProviderCredential(...)              → resolve v1, decifra, entrega ao callback, libera
4. rotateSecretValue(id, "token-xyz")       → ciphertext v1 "superseded", v2 "active"; reference.version = 2
5. withProviderCredential(...)              → resolve v2 (não v1 — sempre a ativa mais recente)
6. revokeSecretValue(id)                    → reference "revoked", ciphertext v2 "revoked"
7. withProviderCredential(...)              → SecretResolutionFailedError("reference_revoked") — nunca resolve
```

## Versionamento — o modelo pedido

```
credential (control_plane_secret_references, 1 linha, version=N atual)
 └─ control_plane_secret_ciphertexts (N linhas, 1 por versão)
     ├ version 1 — status: superseded, supersededAt: <quando v2 nasceu>
     ├ version 2 — status: superseded, supersededAt: <quando v3 nasceu>
     └ version 3 — status: active        ← ÚNICA versão que `getActiveCiphertext` devolve
```

Invariante reforçado por `control_plane_secret_ciphertexts_active_uniq`
(unique index PARCIAL, `where status = 'active'`): impossível existir duas
linhas `"active"` pra mesma `secret_reference_id`, mesmo sob bug de
aplicação — o banco recusa o segundo INSERT.

"Versão futura" (`pending`, do exemplo da tarefa) não foi implementada —
não há caso de uso concreto nesta fase pra pré-provisionar uma versão antes
dela existir de fato; se aparecer, é aditivo (`status` ganha mais um valor
no CHECK, sem quebrar nada existente).

## Concorrência

Ver `threat-model.md` §17 pro detalhe completo. Resumo: o CIPHERTEXT
(a parte sensível) é protegido por `SELECT ... FOR UPDATE` na reference
pai dentro de `fn_vault_write_secret_version` — serializa 100%. A METADATA
(`control_plane_secret_references.version`, um inteiro espelho) tem uma
race pré-existente (migration 0098, não desta fase) que
`rotateSecretValue` evita ACIONAR quando o backend real já resolveu o bump
atomicamente dentro da mesma RPC.

## Deleção vs. revogação

Este backend nunca `DELETE`s uma reference nem uma versão de ciphertext em
uso normal — `revokeSecretValue` marca `"revoked"` (terminal, IRREVERSÍVEL
por desenho: não existe `unrevoke`). `on delete cascade` de
`control_plane_secret_ciphertexts` só dispara se ALGUÉM apagar a
`control_plane_secret_references` inteira (ação administrativa manual, fora
do fluxo normal de aplicação).
