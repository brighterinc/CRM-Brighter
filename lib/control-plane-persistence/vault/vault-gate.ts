/**
 * Gate de execução real do Vault Backend — `REAL_VAULT_BACKEND_ENABLED`,
 * default `false`. Mesmo padrão de
 * `lib/provisioning-adapters/providers/supabase-real-gate.ts::isRealProvisioningEnabled`:
 * lê `process.env` DIRETO, nunca via `lib/env.ts` (que valida com Zod na
 * hora do import e lançaria em CLI/teste sem `.env`).
 *
 * Camada de bloqueio ADICIONAL, independente de:
 *   1. `PostgresPgcryptoRuntimeVaultProvider`/`PgcryptoSecretEncryptionProvider`
 *      nunca estarem no registry/factory default (`createDefaultRuntimeVaultProviderRegistry()` —
 *      mesmo precedente do Real Supabase Adapter não estar em
 *      `createDefaultProvisioningAdapterRegistry()`).
 *   2. A chave mestra (`private.app_secrets`/GUC `app.brighter_vault_key`)
 *      precisar estar configurada no banco pra `fn_vault_encrypt_secret`/
 *      `fn_vault_decrypt_secret` funcionarem de qualquer forma.
 *
 * Mesmo com as três camadas, quem monta o registry real EXPLICITAMENTE (ver
 * `providers/postgres-pgcrypto.ts::registerPostgresPgcryptoVaultProvider`)
 * ainda precisa deste gate ligado — `encrypt()`/`decrypt()` recusam
 * fail-closed se `REAL_VAULT_BACKEND_ENABLED !== "true"`.
 */
import { RealVaultBackendDisabledError } from "./errors";

export type VaultGateEnv = Record<string, string | undefined>;

export function isRealVaultBackendEnabled(env: VaultGateEnv = process.env): boolean {
  return env.REAL_VAULT_BACKEND_ENABLED === "true";
}

/** Lança `RealVaultBackendDisabledError` se o gate estiver desligado (default). Nunca lança se ligado — só confere. */
export function assertRealVaultBackendEnabled(operation: string, env: VaultGateEnv = process.env): void {
  if (!isRealVaultBackendEnabled(env)) {
    throw new RealVaultBackendDisabledError(operation);
  }
}
