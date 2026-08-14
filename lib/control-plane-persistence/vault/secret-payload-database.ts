/**
 * `DatabaseSecretPayloadRepository` — implementação real (Supabase) de
 * `SecretPayloadRepository`. Tabela `control_plane_secret_ciphertexts`
 * (migration deste backend) — SEPARADA de `control_plane_secret_references`.
 *
 * `writeVersion`/`revokeActiveVersion` chamam RPC (`fn_vault_write_secret_version`/
 * `fn_vault_revoke_secret`) em vez de INSERT/UPDATE direto: a escrita de
 * versão precisa ser ATÔMICA (supersede da versão ativa anterior + insert da
 * nova, sob `SELECT ... FOR UPDATE` na `control_plane_secret_references` pai)
 * pra ficar segura sob rotação concorrente — round-trips separados via
 * PostgREST não dariam essa garantia. `getActiveCiphertext`/
 * `listVersionMetadata` são SELECT simples (leitura não precisa da mesma
 * atomicidade).
 *
 * `createAdminClient` é importado DINAMICAMENTE em cada método (nunca no
 * topo do arquivo) — mesmo cuidado de `encryption-pgcrypto.ts`/
 * `repositories/factory.ts`: `lib/supabase/admin.ts` valida env do Supabase
 * na hora do import estático, o que quebraria qualquer teste/CLI que só
 * importa este módulo pelo tipo, sem nunca chamar um método real.
 */
import type { EncryptedSecretPayload } from "./encryption";
import type { SecretCiphertextVersion, SecretCiphertextVersionMetadata, SecretCiphertextVersionStatus, SecretPayloadRepository } from "./secret-payload";

const TABLE = "control_plane_secret_ciphertexts";

type ControlPlaneSecretCiphertextRow = {
  id: string;
  secret_reference_id: string;
  version: number;
  status: SecretCiphertextVersionStatus;
  ciphertext: string; // bytea vem como hex "\\x..." do PostgREST
  encryption_scheme: string;
  key_id: string;
  created_at: string;
  superseded_at: string | null;
  revoked_at: string | null;
};

function hexToBuffer(hex: string): Buffer {
  const normalized = hex.startsWith("\\x") ? hex.slice(2) : hex;
  return Buffer.from(normalized, "hex");
}

function bufferToHex(buffer: Buffer): string {
  return `\\x${buffer.toString("hex")}`;
}

function rowToVersion(row: ControlPlaneSecretCiphertextRow): SecretCiphertextVersion {
  return {
    id: row.id,
    secretReferenceId: row.secret_reference_id,
    version: row.version,
    status: row.status,
    ciphertext: hexToBuffer(row.ciphertext),
    encryptionScheme: row.encryption_scheme,
    keyId: row.key_id,
    createdAt: row.created_at,
    supersededAt: row.superseded_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
  };
}

function rowToMetadata(row: ControlPlaneSecretCiphertextRow): SecretCiphertextVersionMetadata {
  const { ciphertext: _ciphertext, ...rest } = rowToVersion(row);
  void _ciphertext;
  return rest;
}

export class DatabaseSecretPayloadRepository implements SecretPayloadRepository {
  async writeVersion(secretReferenceId: string, payload: EncryptedSecretPayload): Promise<SecretCiphertextVersionMetadata> {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data, error } = await admin
      .rpc("fn_vault_write_secret_version", {
        p_secret_reference_id: secretReferenceId,
        p_ciphertext: bufferToHex(payload.ciphertext),
        p_encryption_scheme: payload.encryptionScheme,
        p_key_id: payload.keyId,
      })
      .single();
    if (error) throw new Error(`[vault-backend] writeVersion failed: ${error.message}`);
    return rowToMetadata(data as ControlPlaneSecretCiphertextRow);
  }

  async getActiveCiphertext(secretReferenceId: string): Promise<SecretCiphertextVersion | null> {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .select("*")
      .eq("secret_reference_id", secretReferenceId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error(`[vault-backend] getActiveCiphertext failed: ${error.message}`);
    return data ? rowToVersion(data as ControlPlaneSecretCiphertextRow) : null;
  }

  async revokeActiveVersion(secretReferenceId: string): Promise<SecretCiphertextVersionMetadata | null> {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { error: rpcError } = await admin.rpc("fn_vault_revoke_secret", { p_secret_reference_id: secretReferenceId });
    if (rpcError) throw new Error(`[vault-backend] revokeActiveVersion failed: ${rpcError.message}`);

    const { data, error } = await admin
      .from(TABLE)
      .select("*")
      .eq("secret_reference_id", secretReferenceId)
      .eq("status", "revoked")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`[vault-backend] revokeActiveVersion (readback) failed: ${error.message}`);
    return data ? rowToMetadata(data as ControlPlaneSecretCiphertextRow) : null;
  }

  async listVersionMetadata(secretReferenceId: string): Promise<SecretCiphertextVersionMetadata[]> {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .select("id, secret_reference_id, version, status, encryption_scheme, key_id, created_at, superseded_at, revoked_at")
      .eq("secret_reference_id", secretReferenceId)
      .order("version", { ascending: false });
    if (error) throw new Error(`[vault-backend] listVersionMetadata failed: ${error.message}`);
    return (data as Omit<ControlPlaneSecretCiphertextRow, "ciphertext">[]).map((row) => ({
      id: row.id,
      secretReferenceId: row.secret_reference_id,
      version: row.version,
      status: row.status,
      encryptionScheme: row.encryption_scheme,
      keyId: row.key_id,
      createdAt: row.created_at,
      supersededAt: row.superseded_at ?? undefined,
      revokedAt: row.revoked_at ?? undefined,
    }));
  }
}
