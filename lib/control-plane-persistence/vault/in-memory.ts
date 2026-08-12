import { assertSafePersistencePayload } from "../safe-persistence";
import {
  VaultReferenceNotFoundError,
  type CreateSecretReferenceInput,
  type CredentialsVault,
  type SecretReferenceMetadata,
  type SecretReferenceReader,
} from "./types";

/**
 * Demonstração/teste — mesma doutrina das *Foundation* In-Memory
 * repositories já existentes (`InMemoryTenantRepository` etc): sem tabela,
 * sem Supabase real, cada instância começa vazia, nunca singleton global.
 */
export class InMemoryCredentialsVault implements CredentialsVault, SecretReferenceReader {
  private readonly references = new Map<string, SecretReferenceMetadata>();

  async createReference(input: CreateSecretReferenceInput): Promise<SecretReferenceMetadata> {
    assertSafePersistencePayload(input, "InMemoryCredentialsVault.createReference");
    const now = new Date().toISOString();
    const metadata: SecretReferenceMetadata = {
      id: crypto.randomUUID(),
      installationId: input.installationId ?? null,
      tenantId: input.tenantId ?? null,
      reference: input.reference,
      type: input.type,
      provider: input.provider,
      vaultProvider: input.vaultProvider,
      vaultKey: input.vaultKey,
      version: 1,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.references.set(metadata.id, metadata);
    return metadata;
  }

  async resolveReferenceMetadata(id: string): Promise<SecretReferenceMetadata | null> {
    return this.references.get(id) ?? null;
  }

  async rotateReference(id: string): Promise<SecretReferenceMetadata> {
    const existing = this.references.get(id);
    if (!existing) throw new VaultReferenceNotFoundError(id);
    const now = new Date().toISOString();
    const rotated: SecretReferenceMetadata = { ...existing, version: existing.version + 1, status: "active", rotatedAt: now, updatedAt: now };
    this.references.set(id, rotated);
    return rotated;
  }

  async revokeReference(id: string): Promise<SecretReferenceMetadata> {
    const existing = this.references.get(id);
    if (!existing) throw new VaultReferenceNotFoundError(id);
    const now = new Date().toISOString();
    const revoked: SecretReferenceMetadata = { ...existing, status: "revoked", revokedAt: now, updatedAt: now };
    this.references.set(id, revoked);
    return revoked;
  }

  async validateReference(id: string): Promise<{ valid: boolean; errors: string[] }> {
    const existing = this.references.get(id);
    if (!existing) return { valid: false, errors: [`reference "${id}" não encontrada`] };
    if (existing.status === "revoked") return { valid: false, errors: ["reference revogada"] };
    return { valid: true, errors: [] };
  }

  /** Fora de `CredentialsVault` de propósito (ver `SecretReferenceReader`) — só pra listagem da admin UI. */
  async listByInstallation(installationId: string): Promise<SecretReferenceMetadata[]> {
    return Array.from(this.references.values())
      .filter((r) => r.installationId === installationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
