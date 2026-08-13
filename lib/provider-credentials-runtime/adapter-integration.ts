/**
 * Integração com a Provisioning Adapters Foundation
 * (`lib/provisioning-adapters/`) — interpreta os campos soltos
 * `requiredCredentialPurpose`/`requiredSecretType` de
 * `ProvisioningAdapterCapability` (adicionados nesta etapa, ver
 * `lib/provisioning-adapters/types.ts`) contra o vocabulário TIPADO desta
 * camada (`ProviderCredentialPurpose`/`SecretReferenceType`).
 *
 * A dependência é SEMPRE nesta direção — `provider-credentials-runtime`
 * conhece `provisioning-adapters`, nunca o inverso (evita import circular:
 * `provisioning-adapters/types.ts` mantém os dois campos como `string`
 * solto de propósito).
 *
 * Nenhum adapter real é executado aqui — só leitura do catálogo estático
 * (`PROVISIONING_ADAPTER_CAPABILITY_CATALOG`), sem I/O.
 */
import { findCapability } from "@/lib/provisioning-adapters/capabilities";
import type { ProvisioningAdapterCapability, ProvisioningProvider } from "@/lib/provisioning-adapters/types";
import { SECRET_REFERENCE_TYPES } from "@/lib/control-plane-persistence/types";

import type { ProviderCredentialAdapterRequirement } from "./policy";
import { PROVIDER_CREDENTIAL_PURPOSES, type ProviderCredentialPurpose, type SecretReferenceType } from "./types";

function isProviderCredentialPurpose(value: string): value is ProviderCredentialPurpose {
  return (PROVIDER_CREDENTIAL_PURPOSES as readonly string[]).includes(value);
}

function isSecretReferenceType(value: string): value is SecretReferenceType {
  return (SECRET_REFERENCE_TYPES as readonly string[]).includes(value);
}

/**
 * Converte os campos soltos de uma `ProvisioningAdapterCapability` num
 * `ProviderCredentialAdapterRequirement` tipado — `null` se a capability não
 * declarou `requiredCredentialPurpose`, OU se declarou um valor fora do
 * vocabulário conhecido (erro de configuração vira "nenhum requisito
 * válido", nunca vira um requisito adulterado passando por válido).
 */
export function credentialRequirementFromCapability(
  capability: ProvisioningAdapterCapability | null | undefined,
): ProviderCredentialAdapterRequirement | null {
  if (!capability?.requiredCredentialPurpose) return null;
  if (!isProviderCredentialPurpose(capability.requiredCredentialPurpose)) return null;

  const secretType =
    capability.requiredSecretType && isSecretReferenceType(capability.requiredSecretType) ? capability.requiredSecretType : undefined;

  return { purpose: capability.requiredCredentialPurpose, secretType };
}

/**
 * Busca a capability declarada pro `provider`/`operation` no catálogo
 * estático da Provisioning Adapters Foundation e devolve o requisito de
 * credencial já tipado — usado como `loadAdapterRequirement` em
 * `factory.ts`/`runtime.ts`.
 */
export function resolveCredentialRequirementForAdapter(
  provider: ProvisioningProvider,
  operation: string,
): ProviderCredentialAdapterRequirement | null {
  return credentialRequirementFromCapability(findCapability(provider, operation));
}
