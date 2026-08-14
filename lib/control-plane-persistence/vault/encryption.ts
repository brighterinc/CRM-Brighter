/**
 * `SecretEncryptionProvider` — abstração de criptografia do Real Vault
 * Backend, deliberadamente SEPARADA de `RuntimeVaultProvider`
 * (`lib/provider-credentials-runtime/types.ts`). `RuntimeVaultProvider`
 * decide QUEM pode resolver o quê (policy, lease, boundary); esta interface
 * só decide COMO um valor vira ciphertext e volta — nunca toca
 * tenant/installation/policy.
 *
 * Separação existe pra permitir trocar o backend de criptografia sem
 * reescrever `PostgresPgcryptoRuntimeVaultProvider` nem qualquer código
 * acima dele: hoje `PgcryptoSecretEncryptionProvider` (Postgres
 * `pgp_sym_encrypt`/`pgp_sym_decrypt` via RPC), amanhã um provider de KMS
 * (AWS/GCP) ou Vault externo (HashiCorp) — mesma interface, troca só a
 * implementação injetada.
 *
 * `keyId`/`encryptionScheme` preparam evolução SEM migração de dado: hoje
 * sempre `"pgcrypto_aes256"`/`"default"` (uma única chave mestra), mas o
 * formato já suporta múltiplas chaves convivendo (rotação de CHAVE MESTRA,
 * distinta de rotação de SEGREDO — ver `docs/vault-backend/encryption.md`).
 */

export type EncryptedSecretPayload = {
  /** Nunca o plaintext — sempre o resultado de `encrypt()`. */
  ciphertext: Buffer;
  /** Identifica o algoritmo/formato usado — ex.: `"pgcrypto_aes256"`. Nunca inferido do ciphertext em si. */
  encryptionScheme: string;
  /** Identifica QUAL chave mestra cifrou este payload — prepara rotação de chave mestra futura, sem uso nesta fase além de `"default"`. */
  keyId: string;
};

export class SecretEncryptionUnavailableError extends Error {
  constructor(
    public readonly providerId: string,
    message: string,
  ) {
    super(`secret_encryption_unavailable: "${providerId}" — ${message}`);
    this.name = "SecretEncryptionUnavailableError";
  }
}

/** Nunca inclui o plaintext nem o ciphertext na mensagem — só contexto operacional. */
export class SecretEncryptionFailedError extends Error {
  constructor(
    public readonly providerId: string,
    message: string,
  ) {
    super(`secret_encryption_failed: "${providerId}" — ${message}`);
    this.name = "SecretEncryptionFailedError";
  }
}

/**
 * Cobre chave errada, ciphertext corrompido/truncado, e formato/versão de
 * scheme desconhecido — nunca detalha qual dos três foi (evita oferecer um
 * oráculo de criptoanálise a quem só tem acesso de leitura ao erro).
 */
export class SecretDecryptionFailedError extends Error {
  constructor(
    public readonly providerId: string,
    message: string,
  ) {
    super(`secret_decryption_failed: "${providerId}" — ${message}`);
    this.name = "SecretDecryptionFailedError";
  }
}

export type SecretEncryptionProviderHealth = {
  id: string;
  available: boolean;
  message: string;
};

export interface SecretEncryptionProvider {
  readonly id: string;
  encrypt(plaintext: string): Promise<EncryptedSecretPayload>;
  decrypt(payload: Pick<EncryptedSecretPayload, "ciphertext" | "encryptionScheme" | "keyId">): Promise<string>;
  healthPreview(): Promise<SecretEncryptionProviderHealth>;
}
