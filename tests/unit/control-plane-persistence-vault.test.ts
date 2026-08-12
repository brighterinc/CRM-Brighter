import { describe, expect, it } from "vitest";

import { UnsafePersistencePayloadError } from "@/lib/control-plane-persistence/safe-persistence";
import { InMemoryCredentialsVault } from "@/lib/control-plane-persistence/vault/in-memory";
import { NoopCredentialsVault } from "@/lib/control-plane-persistence/vault/noop";
import { VaultDisabledError, VaultReferenceNotFoundError } from "@/lib/control-plane-persistence/vault/types";

describe("NoopCredentialsVault", () => {
  const vault = new NoopCredentialsVault();

  it("createReference sempre lança VaultDisabledError", async () => {
    await expect(
      vault.createReference({ reference: "r", type: "api_key", provider: "supabase", vaultProvider: "noop", vaultKey: "k" }),
    ).rejects.toThrow(VaultDisabledError);
  });

  it("todas as 5 operações lançam — nunca finge sucesso", async () => {
    await expect(vault.resolveReferenceMetadata("x")).rejects.toThrow(VaultDisabledError);
    await expect(vault.rotateReference("x")).rejects.toThrow(VaultDisabledError);
    await expect(vault.revokeReference("x")).rejects.toThrow(VaultDisabledError);
    await expect(vault.validateReference("x")).rejects.toThrow(VaultDisabledError);
  });
});

describe("InMemoryCredentialsVault", () => {
  it("nunca expõe getSecretValue (não existe na interface)", () => {
    const vault = new InMemoryCredentialsVault();
    expect((vault as unknown as Record<string, unknown>).getSecretValue).toBeUndefined();
  });

  it("createReference recusa payload com chave sensível (fail-closed)", async () => {
    const vault = new InMemoryCredentialsVault();
    await expect(
      vault.createReference({
        reference: "r",
        type: "api_key",
        provider: "supabase",
        vaultProvider: "in_memory",
        vaultKey: "k",
        // @ts-expect-error -- campo extra deliberado pra provar defesa em profundidade
        password: "nunca-deveria-persistir",
      }),
    ).rejects.toThrow(UnsafePersistencePayloadError);
  });

  it("ciclo de vida completo: create -> resolve -> rotate -> revoke -> validate", async () => {
    const vault = new InMemoryCredentialsVault();
    const created = await vault.createReference({
      reference: "ref-1",
      type: "api_key",
      provider: "supabase",
      vaultProvider: "in_memory",
      vaultKey: "placeholder/1",
    });
    expect(created.status).toBe("active");
    expect(created.version).toBe(1);

    const resolved = await vault.resolveReferenceMetadata(created.id);
    expect(resolved?.reference).toBe("ref-1");

    const rotated = await vault.rotateReference(created.id);
    expect(rotated.version).toBe(2);
    expect(rotated.rotatedAt).toBeDefined();

    const revoked = await vault.revokeReference(created.id);
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).toBeDefined();

    const validation = await vault.validateReference(created.id);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toMatch(/revogada/);
  });

  it("resolveReferenceMetadata devolve null pra id inexistente (não lança)", async () => {
    const vault = new InMemoryCredentialsVault();
    expect(await vault.resolveReferenceMetadata("id-inexistente")).toBeNull();
  });

  it("rotateReference/revokeReference lançam VaultReferenceNotFoundError pra id inexistente", async () => {
    const vault = new InMemoryCredentialsVault();
    await expect(vault.rotateReference("id-inexistente")).rejects.toThrow(VaultReferenceNotFoundError);
    await expect(vault.revokeReference("id-inexistente")).rejects.toThrow(VaultReferenceNotFoundError);
  });

  it("cada instância começa vazia — nunca compartilha estado", async () => {
    const vaultA = new InMemoryCredentialsVault();
    const vaultB = new InMemoryCredentialsVault();
    const created = await vaultA.createReference({
      reference: "ref-a",
      type: "api_key",
      provider: "supabase",
      vaultProvider: "in_memory",
      vaultKey: "k",
    });
    expect(await vaultB.resolveReferenceMetadata(created.id)).toBeNull();
  });
});
