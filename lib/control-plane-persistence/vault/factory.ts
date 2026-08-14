/**
 * Fábrica de conveniência do Real Vault Backend — monta as peças reais
 * (`DatabaseSecretPayloadRepository`, `PgcryptoSecretEncryptionProvider`) e
 * devolve um `PostgresPgcryptoRuntimeVaultProvider` pronto pra registrar
 * (`lib/provider-credentials-runtime/providers/index.ts::registerPostgresPgcryptoVaultProvider`).
 * Troca EXPLÍCITA de peças (nunca singleton global) — mesmo espírito de
 * `createProviderCredentialsRuntimeDeps`
 * (`lib/provider-credentials-runtime/factory.ts`).
 *
 * NUNCA chamada pelo boot padrão da app nem por CLI/teste — só por quem
 * quer efetivamente ligar o backend real (`REAL_VAULT_BACKEND_ENABLED=true`
 * no ambiente, chave mestra configurada no banco). Importar este módulo NÃO
 * toca env/rede sozinho — só as chamadas de `encrypt`/`decrypt` fazem, e
 * essas já checam o gate (`vault-gate.ts`) fail-closed.
 */
import { PgcryptoSecretEncryptionProvider, type PgcryptoSecretEncryptionProviderOptions } from "./encryption-pgcrypto";
import type { SecretEncryptionProvider } from "./encryption";
import { DatabaseSecretPayloadRepository } from "./secret-payload-database";
import type { SecretPayloadRepository } from "./secret-payload";
import { recordSecretUsage } from "./secret-value-service";
import type { ControlPlaneRepositories } from "../repositories/factory";

import {
  createPostgresPgcryptoRuntimeVaultProvider,
  type PostgresPgcryptoRuntimeVaultProvider,
} from "@/lib/provider-credentials-runtime/providers/postgres-pgcrypto";

export type CreateRealVaultBackendOptions = {
  payloadRepository?: SecretPayloadRepository;
  encryptionProvider?: SecretEncryptionProvider;
  encryptionOptions?: PgcryptoSecretEncryptionProviderOptions;
};

export function createRealVaultBackendRuntimeVaultProvider(
  repos: ControlPlaneRepositories,
  options: CreateRealVaultBackendOptions = {},
): PostgresPgcryptoRuntimeVaultProvider {
  const payloadRepository = options.payloadRepository ?? new DatabaseSecretPayloadRepository();
  const encryptionProvider = options.encryptionProvider ?? new PgcryptoSecretEncryptionProvider(options.encryptionOptions);

  return createPostgresPgcryptoRuntimeVaultProvider({
    payloadRepository,
    encryptionProvider,
    recordUsage: (secretReferenceId) => recordSecretUsage(repos, secretReferenceId),
  });
}
