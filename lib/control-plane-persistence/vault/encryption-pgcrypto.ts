/**
 * `PgcryptoSecretEncryptionProvider` — implementação REAL de
 * `SecretEncryptionProvider` (`./encryption.ts`). Nunca cifra/decifra em
 * TypeScript: só chama duas funções Postgres `SECURITY DEFINER` NOVAS
 * (`public.fn_vault_encrypt_secret`/`public.fn_vault_decrypt_secret`,
 * migration deste backend), via RPC do client admin (service_role) —
 * mesmo padrão de infraestrutura do OAuth do Nuvemshop
 * (`fn_encrypt_oauth`/`fn_decrypt_oauth`, migration 0006/0041), mas
 * DELIBERADAMENTE funções PRÓPRIAS, nunca as do Nuvemshop (doutrina do
 * ROADMAP §"Vault Backend Real" e `docs/control-plane-persistence/credentials-vault.md`).
 *
 * `VaultCryptoRpcClient` é injetado (nunca `createAdminClient()` direto no
 * construtor) — mesma cautela de `lib/supabase/admin.ts` -> `lib/env.ts`
 * validar env na hora do import: quem monta este provider em teste/CLI
 * injeta um client fake, nunca precisa de `.env` do Supabase.
 * `createSupabaseVaultCryptoRpcClient()` é a fábrica do client real, só
 * chamada por quem efetivamente quer o backend real (nunca pelo registry
 * default — ver `providers/postgres-pgcrypto.ts`).
 *
 * Gate `REAL_VAULT_BACKEND_ENABLED` (`./vault-gate.ts`) é checado em TODA
 * chamada de `encrypt()`/`decrypt()` — camada de bloqueio independente de
 * quem decidiu instanciar este provider.
 *
 * `createAdminClient` é importado DINAMICAMENTE dentro de cada método
 * (nunca no topo do arquivo) — `lib/supabase/admin.ts` importa `lib/env.ts`,
 * que VALIDA env vars do Supabase NA HORA do import e lança se faltarem.
 * Import estático aqui quebraria qualquer teste/CLI que só instancia
 * `PgcryptoSecretEncryptionProvider` com um client fake injetado (nunca
 * precisa de `.env` real) — mesmo cuidado já documentado em
 * `lib/control-plane-persistence/repositories/factory.ts` e `services.ts`.
 */
import { SecretDecryptionFailedError, SecretEncryptionFailedError, type EncryptedSecretPayload, type SecretEncryptionProvider, type SecretEncryptionProviderHealth } from "./encryption";
import { assertRealVaultBackendEnabled, isRealVaultBackendEnabled } from "./vault-gate";

const ENCRYPTION_SCHEME = "pgcrypto_aes256";
const KEY_ID = "default";

export interface VaultCryptoRpcClient {
  /** Chama `public.fn_vault_encrypt_secret(plaintext)` — devolve o `bytea` cru. */
  encryptSecret(plaintext: string): Promise<Buffer>;
  /** Chama `public.fn_vault_decrypt_secret(ciphertext)` — devolve o plaintext. */
  decryptSecret(ciphertext: Buffer): Promise<string>;
}

/**
 * `bytea` volta do PostgREST como string hex `"\\x..."` — decodifica pro
 * `Buffer` real. Encoding inverso ao enviar: PostgREST aceita `bytea` como
 * string hex também, então serializamos do mesmo jeito na chamada RPC.
 */
function hexToBuffer(hex: string): Buffer {
  const normalized = hex.startsWith("\\x") ? hex.slice(2) : hex;
  return Buffer.from(normalized, "hex");
}

function bufferToHex(buffer: Buffer): string {
  return `\\x${buffer.toString("hex")}`;
}

export class SupabaseVaultCryptoRpcClient implements VaultCryptoRpcClient {
  async encryptSecret(plaintext: string): Promise<Buffer> {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("fn_vault_encrypt_secret", { plaintext });
    if (error) throw new SecretEncryptionFailedError("postgres_pgcrypto", `RPC fn_vault_encrypt_secret falhou: ${error.message}`);
    if (typeof data !== "string") throw new SecretEncryptionFailedError("postgres_pgcrypto", "RPC fn_vault_encrypt_secret devolveu formato inesperado");
    return hexToBuffer(data);
  }

  async decryptSecret(ciphertext: Buffer): Promise<string> {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("fn_vault_decrypt_secret", { ciphertext: bufferToHex(ciphertext) });
    if (error) throw new SecretDecryptionFailedError("postgres_pgcrypto", `RPC fn_vault_decrypt_secret falhou: ${error.message}`);
    if (typeof data !== "string") throw new SecretDecryptionFailedError("postgres_pgcrypto", "RPC fn_vault_decrypt_secret devolveu formato inesperado");
    return data;
  }
}

export type PgcryptoSecretEncryptionProviderOptions = {
  client?: VaultCryptoRpcClient;
};

export class PgcryptoSecretEncryptionProvider implements SecretEncryptionProvider {
  readonly id = "postgres_pgcrypto" as const;

  private readonly client: VaultCryptoRpcClient;

  constructor(options: PgcryptoSecretEncryptionProviderOptions = {}) {
    this.client = options.client ?? new SupabaseVaultCryptoRpcClient();
  }

  async encrypt(plaintext: string): Promise<EncryptedSecretPayload> {
    assertRealVaultBackendEnabled("encrypt");
    const ciphertext = await this.client.encryptSecret(plaintext);
    return { ciphertext, encryptionScheme: ENCRYPTION_SCHEME, keyId: KEY_ID };
  }

  async decrypt(payload: Pick<EncryptedSecretPayload, "ciphertext" | "encryptionScheme" | "keyId">): Promise<string> {
    assertRealVaultBackendEnabled("decrypt");
    if (payload.encryptionScheme !== ENCRYPTION_SCHEME) {
      throw new SecretDecryptionFailedError(this.id, `encryption scheme desconhecido: "${payload.encryptionScheme}"`);
    }
    return this.client.decryptSecret(payload.ciphertext);
  }

  async healthPreview(): Promise<SecretEncryptionProviderHealth> {
    const enabled = isRealVaultBackendEnabled();
    return {
      id: this.id,
      available: enabled,
      message: enabled
        ? "Postgres pgcrypto — REAL_VAULT_BACKEND_ENABLED=true (não confirma que a chave mestra está configurada no banco)."
        : "Postgres pgcrypto — desabilitado (REAL_VAULT_BACKEND_ENABLED não é \"true\", default seguro).",
    };
  }
}
