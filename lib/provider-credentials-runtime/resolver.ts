/**
 * Resolução de referência → valor. Duas etapas, deliberadamente separadas
 * (mesmo espírito de `CredentialsVault` vs `RuntimeVaultProvider` serem
 * contratos distintos):
 *
 *   1. `resolveSecretReferenceMetadata` — metadata via `CredentialsVault`
 *      já persistido (`lib/control-plane-persistence/vault`), nunca um
 *      valor.
 *   2. `resolveSecretValue` — valor de verdade via o `RuntimeVaultProvider`
 *      registrado que suporta o `vaultProvider` da metadata.
 *
 * Espelha a doutrina de `lib/ai/credentials.ts::loadCredential`: erro
 * tipado com `reason` (`SecretResolutionFailedError`), nunca cacheia
 * plaintext, devolve o valor só dentro do wrapper `ResolvedCredential`
 * (nunca solto). Não faz policy (isso é `policy.ts`, chamado ANTES por
 * `runtime.ts`) — resolver só resolve, não autoriza.
 */
import type { CredentialsVault } from "@/lib/control-plane-persistence/vault/types";

import { SecretResolutionFailedError } from "./errors";
import type { RuntimeVaultProviderRegistry } from "./registry";
import type { ResolvedCredential, ResolveSecretOptions, SecretReferenceMetadata } from "./types";

export type SecretValueResolverDeps = {
  vault: CredentialsVault;
  vaultProviderRegistry: RuntimeVaultProviderRegistry;
};

export async function resolveSecretReferenceMetadata(
  deps: Pick<SecretValueResolverDeps, "vault">,
  secretReferenceId: string,
): Promise<SecretReferenceMetadata> {
  const metadata = await deps.vault.resolveReferenceMetadata(secretReferenceId);
  if (!metadata) {
    throw new SecretResolutionFailedError("reference_not_found", `nenhuma secret reference com id ${secretReferenceId}`);
  }
  return metadata;
}

export async function resolveSecretValue(
  deps: Pick<SecretValueResolverDeps, "vaultProviderRegistry">,
  metadata: SecretReferenceMetadata,
  options: ResolveSecretOptions,
): Promise<ResolvedCredential> {
  if (metadata.status === "revoked") {
    throw new SecretResolutionFailedError("reference_revoked", `reference ${metadata.id} está revogada`);
  }
  if (metadata.status !== "active") {
    throw new SecretResolutionFailedError("reference_inactive", `reference ${metadata.id} está com status "${metadata.status}"`);
  }

  const provider = deps.vaultProviderRegistry.resolveProviderForVault(metadata.vaultProvider);
  return provider.resolveSecret(metadata, options);
}

/** Conveniência — as duas etapas em sequência, pra quem (ex.: `runtime.ts`) já autorizou o acesso e só quer o resultado final. */
export async function resolveProviderCredential(
  deps: SecretValueResolverDeps,
  secretReferenceId: string,
  options: ResolveSecretOptions,
): Promise<ResolvedCredential> {
  const metadata = await resolveSecretReferenceMetadata(deps, secretReferenceId);
  return resolveSecretValue(deps, metadata, options);
}
