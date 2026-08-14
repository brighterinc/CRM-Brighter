import { describe, expect, it } from "vitest";

import { SecretDecryptionFailedError } from "@/lib/control-plane-persistence/vault/encryption";
import { FakeSecretEncryptionProvider } from "@/lib/control-plane-persistence/vault/encryption-fake";
import { PgcryptoSecretEncryptionProvider, type VaultCryptoRpcClient } from "@/lib/control-plane-persistence/vault/encryption-pgcrypto";
import { RealVaultBackendDisabledError } from "@/lib/control-plane-persistence/vault/errors";

describe("FakeSecretEncryptionProvider", () => {
  it("encrypt -> decrypt roundtrip devolve o plaintext original", async () => {
    const provider = new FakeSecretEncryptionProvider();
    const encrypted = await provider.encrypt("valor-nunca-real-123");
    expect(encrypted.ciphertext.toString("utf8")).not.toContain("valor-nunca-real-123");
    const decrypted = await provider.decrypt(encrypted);
    expect(decrypted).toBe("valor-nunca-real-123");
  });

  it("chave errada nunca decifra o ciphertext de outra instância (wrong-key)", async () => {
    const a = new FakeSecretEncryptionProvider("key-a-32-chars-minimum-aaaaaaaa");
    const b = new FakeSecretEncryptionProvider("key-b-32-chars-minimum-bbbbbbbb");
    const encrypted = await a.encrypt("segredo-do-tenant-a");
    await expect(b.decrypt(encrypted)).rejects.toThrow(SecretDecryptionFailedError);
  });

  it("ciphertext corrompido/truncado falha ao decifrar (corrupted)", async () => {
    const provider = new FakeSecretEncryptionProvider();
    const encrypted = await provider.encrypt("valor-integro");
    provider.corruptNextCiphertext();
    await expect(provider.decrypt(encrypted)).rejects.toThrow(SecretDecryptionFailedError);
  });

  it("encryption scheme desconhecido é recusado", async () => {
    const provider = new FakeSecretEncryptionProvider();
    await expect(provider.decrypt({ ciphertext: Buffer.from("x"), encryptionScheme: "unknown_scheme", keyId: "default" })).rejects.toThrow(
      SecretDecryptionFailedError,
    );
  });

  it("healthPreview nunca finge ser produção", async () => {
    const provider = new FakeSecretEncryptionProvider();
    const health = await provider.healthPreview();
    expect(health.available).toBe(true);
    expect(health.message.toLowerCase()).toContain("nunca criptografia real");
  });
});

describe("PgcryptoSecretEncryptionProvider — gate fail-closed", () => {
  it("encrypt() recusa quando REAL_VAULT_BACKEND_ENABLED não é 'true'", async () => {
    const previous = process.env.REAL_VAULT_BACKEND_ENABLED;
    delete process.env.REAL_VAULT_BACKEND_ENABLED;
    try {
      const provider = new PgcryptoSecretEncryptionProvider({ client: { encryptSecret: async () => Buffer.from("nunca-chamado"), decryptSecret: async () => "nunca-chamado" } });
      await expect(provider.encrypt("qualquer-coisa")).rejects.toThrow(RealVaultBackendDisabledError);
    } finally {
      if (previous === undefined) delete process.env.REAL_VAULT_BACKEND_ENABLED;
      else process.env.REAL_VAULT_BACKEND_ENABLED = previous;
    }
  });

  it("decrypt() recusa quando REAL_VAULT_BACKEND_ENABLED não é 'true'", async () => {
    const previous = process.env.REAL_VAULT_BACKEND_ENABLED;
    delete process.env.REAL_VAULT_BACKEND_ENABLED;
    try {
      const provider = new PgcryptoSecretEncryptionProvider({ client: { encryptSecret: async () => Buffer.from("nunca-chamado"), decryptSecret: async () => "nunca-chamado" } });
      await expect(provider.decrypt({ ciphertext: Buffer.from("x"), encryptionScheme: "pgcrypto_aes256", keyId: "default" })).rejects.toThrow(
        RealVaultBackendDisabledError,
      );
    } finally {
      if (previous === undefined) delete process.env.REAL_VAULT_BACKEND_ENABLED;
      else process.env.REAL_VAULT_BACKEND_ENABLED = previous;
    }
  });

  it("com gate ligado, delega pro client RPC injetado (nunca cifra em TS)", async () => {
    const previous = process.env.REAL_VAULT_BACKEND_ENABLED;
    process.env.REAL_VAULT_BACKEND_ENABLED = "true";
    try {
      let encryptCalledWith: string | null = null;
      const fakeClient: VaultCryptoRpcClient = {
        encryptSecret: async (plaintext) => {
          encryptCalledWith = plaintext;
          return Buffer.from("ciphertext-simulado-vindo-do-rpc");
        },
        decryptSecret: async () => "plaintext-simulado-vindo-do-rpc",
      };
      const provider = new PgcryptoSecretEncryptionProvider({ client: fakeClient });

      const encrypted = await provider.encrypt("valor-de-teste");
      expect(encryptCalledWith).toBe("valor-de-teste");
      expect(encrypted.encryptionScheme).toBe("pgcrypto_aes256");

      const decrypted = await provider.decrypt(encrypted);
      expect(decrypted).toBe("plaintext-simulado-vindo-do-rpc");
    } finally {
      if (previous === undefined) delete process.env.REAL_VAULT_BACKEND_ENABLED;
      else process.env.REAL_VAULT_BACKEND_ENABLED = previous;
    }
  });

  it("decrypt() recusa encryption scheme desconhecido antes mesmo de chamar o client", async () => {
    const previous = process.env.REAL_VAULT_BACKEND_ENABLED;
    process.env.REAL_VAULT_BACKEND_ENABLED = "true";
    try {
      let decryptCalled = false;
      const provider = new PgcryptoSecretEncryptionProvider({
        client: { encryptSecret: async () => Buffer.from("x"), decryptSecret: async () => { decryptCalled = true; return "x"; } },
      });
      await expect(provider.decrypt({ ciphertext: Buffer.from("x"), encryptionScheme: "outro_scheme", keyId: "default" })).rejects.toThrow(
        SecretDecryptionFailedError,
      );
      expect(decryptCalled).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.REAL_VAULT_BACKEND_ENABLED;
      else process.env.REAL_VAULT_BACKEND_ENABLED = previous;
    }
  });
});
