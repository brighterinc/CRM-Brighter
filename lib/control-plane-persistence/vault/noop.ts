import { VaultDisabledError, type CreateSecretReferenceInput, type CredentialsVault, type SecretReferenceMetadata } from "./types";

/**
 * Vault que recusa toda operação — o default seguro quando nenhum backend
 * está configurado. Existir explicitamente (em vez de "vault ausente = null
 * em algum lugar") é o que garante fail-closed: um chamador que esquece de
 * trocar pra um vault real recebe erro na hora, não silêncio.
 */
export class NoopCredentialsVault implements CredentialsVault {
  async createReference(_input: CreateSecretReferenceInput): Promise<SecretReferenceMetadata> {
    throw new VaultDisabledError("createReference");
  }

  async resolveReferenceMetadata(_id: string): Promise<SecretReferenceMetadata | null> {
    throw new VaultDisabledError("resolveReferenceMetadata");
  }

  async rotateReference(_id: string): Promise<SecretReferenceMetadata> {
    throw new VaultDisabledError("rotateReference");
  }

  async revokeReference(_id: string): Promise<SecretReferenceMetadata> {
    throw new VaultDisabledError("revokeReference");
  }

  async validateReference(_id: string): Promise<{ valid: boolean; errors: string[] }> {
    throw new VaultDisabledError("validateReference");
  }
}
