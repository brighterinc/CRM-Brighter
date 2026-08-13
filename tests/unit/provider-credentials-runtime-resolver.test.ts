import { describe, expect, it } from "vitest";

import { InMemoryCredentialsVault } from "@/lib/control-plane-persistence/vault/in-memory";

import { SecretResolutionFailedError } from "@/lib/provider-credentials-runtime/errors";
import { InMemoryRuntimeVaultProvider } from "@/lib/provider-credentials-runtime/providers/in-memory";
import { createDefaultRuntimeVaultProviderRegistry } from "@/lib/provider-credentials-runtime/providers";
import { resolveProviderCredential, resolveSecretReferenceMetadata, resolveSecretValue } from "@/lib/provider-credentials-runtime/resolver";

describe("resolveSecretReferenceMetadata", () => {
  it("resolve a metadata de uma referência existente", async () => {
    const vault = new InMemoryCredentialsVault();
    const created = await vault.createReference({ reference: "ref-1", type: "api_key", provider: "fake", vaultProvider: "in_memory", vaultKey: "k" });
    const metadata = await resolveSecretReferenceMetadata({ vault }, created.id);
    expect(metadata.id).toBe(created.id);
  });

  it("lança SecretResolutionFailedError('reference_not_found') se a referência não existe", async () => {
    const vault = new InMemoryCredentialsVault();
    await expect(resolveSecretReferenceMetadata({ vault }, "id-inexistente")).rejects.toThrow(SecretResolutionFailedError);
  });
});

describe("resolveSecretValue", () => {
  it("lança 'reference_revoked' pra referência revogada", async () => {
    const vault = new InMemoryCredentialsVault();
    const created = await vault.createReference({ reference: "ref-1", type: "api_key", provider: "fake", vaultProvider: "in_memory", vaultKey: "k" });
    const revoked = await vault.revokeReference(created.id);
    const registry = createDefaultRuntimeVaultProviderRegistry();
    await expect(resolveSecretValue({ vaultProviderRegistry: registry }, revoked, { singleUse: true })).rejects.toMatchObject({
      reason: "reference_revoked",
    });
  });

  it("lança 'reference_inactive' pra referência pendente/rotada", async () => {
    const vault = new InMemoryCredentialsVault();
    const created = await vault.createReference({ reference: "ref-1", type: "api_key", provider: "fake", vaultProvider: "in_memory", vaultKey: "k" });
    const rotated = await vault.rotateReference(created.id);
    // rotateReference volta status pra "active" nesta implementação — força "pending" manualmente pro teste.
    const pending = { ...rotated, status: "pending" as const };
    const registry = createDefaultRuntimeVaultProviderRegistry();
    await expect(resolveSecretValue({ vaultProviderRegistry: registry }, pending, { singleUse: true })).rejects.toMatchObject({
      reason: "reference_inactive",
    });
  });

  it("resolve valor de verdade via o RuntimeVaultProvider correto (in_memory)", async () => {
    const vault = new InMemoryCredentialsVault();
    const created = await vault.createReference({ reference: "ref-1", type: "api_key", provider: "fake", vaultProvider: "in_memory", vaultKey: "k" });
    const registry = createDefaultRuntimeVaultProviderRegistry();
    const inMemory = registry.findProvider("in_memory") as InMemoryRuntimeVaultProvider;
    inMemory.seed(created.id, "synthetic-value");

    const credential = await resolveSecretValue({ vaultProviderRegistry: registry }, created, { singleUse: true });
    expect(credential.use((v) => v)).toBe("synthetic-value");
  });
});

describe("resolveProviderCredential (conveniência — metadata + valor)", () => {
  it("resolve as duas etapas em sequência", async () => {
    const vault = new InMemoryCredentialsVault();
    const created = await vault.createReference({ reference: "ref-1", type: "api_key", provider: "fake", vaultProvider: "in_memory", vaultKey: "k" });
    const registry = createDefaultRuntimeVaultProviderRegistry();
    const inMemory = registry.findProvider("in_memory") as InMemoryRuntimeVaultProvider;
    inMemory.seed(created.id, "synthetic-value");

    const credential = await resolveProviderCredential({ vault, vaultProviderRegistry: registry }, created.id, { singleUse: true });
    expect(credential.use((v) => v)).toBe("synthetic-value");
  });
});
