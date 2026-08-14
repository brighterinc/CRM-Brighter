import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { FakeSecretEncryptionProvider } from "@/lib/control-plane-persistence/vault/encryption-fake";
import { InMemorySecretPayloadRepository } from "@/lib/control-plane-persistence/vault/secret-payload";

describe("InMemorySecretPayloadRepository", () => {
  it("writeVersion cria versão 1 ativa — metadata nunca carrega ciphertext", async () => {
    const repo = new InMemorySecretPayloadRepository();
    const encryption = new FakeSecretEncryptionProvider();
    const secretReferenceId = randomUUID();

    const encrypted = await encryption.encrypt("valor-v1");
    const version = await repo.writeVersion(secretReferenceId, encrypted);

    expect(version.version).toBe(1);
    expect(version.status).toBe("active");
    expect((version as unknown as Record<string, unknown>).ciphertext).toBeUndefined();

    const active = await repo.getActiveCiphertext(secretReferenceId);
    expect(active?.version).toBe(1);
    expect(active?.ciphertext).toBeInstanceOf(Buffer);
  });

  it("rotação (2ª writeVersion) supersede a v1 e ativa a v2 — nunca duas ativas", async () => {
    const repo = new InMemorySecretPayloadRepository();
    const encryption = new FakeSecretEncryptionProvider();
    const secretReferenceId = randomUUID();

    await repo.writeVersion(secretReferenceId, await encryption.encrypt("valor-v1"));
    const v2 = await repo.writeVersion(secretReferenceId, await encryption.encrypt("valor-v2"));

    expect(v2.version).toBe(2);
    const all = await repo.listVersionMetadata(secretReferenceId);
    const actives = all.filter((v) => v.status === "active");
    expect(actives).toHaveLength(1);
    expect(actives[0]!.version).toBe(2);

    const superseded = all.find((v) => v.version === 1);
    expect(superseded?.status).toBe("superseded");
    expect(superseded?.supersededAt).toBeDefined();

    const active = await repo.getActiveCiphertext(secretReferenceId);
    expect(active?.version).toBe(2);
    expect(active ? Buffer.from(await encryption.decrypt(active)).toString() : null).toBe("valor-v2");
  });

  it("revokeActiveVersion é terminal — versão revogada nunca volta a ficar ativa", async () => {
    const repo = new InMemorySecretPayloadRepository();
    const encryption = new FakeSecretEncryptionProvider();
    const secretReferenceId = randomUUID();

    await repo.writeVersion(secretReferenceId, await encryption.encrypt("valor-v1"));
    const revoked = await repo.revokeActiveVersion(secretReferenceId);

    expect(revoked?.status).toBe("revoked");
    expect(revoked?.revokedAt).toBeDefined();
    expect(await repo.getActiveCiphertext(secretReferenceId)).toBeNull();
  });

  it("revokeActiveVersion sem versão ativa devolve null (idempotente, nunca lança)", async () => {
    const repo = new InMemorySecretPayloadRepository();
    const secretReferenceId = randomUUID();
    expect(await repo.revokeActiveVersion(secretReferenceId)).toBeNull();
  });

  it("getActiveCiphertext pra reference inexistente devolve null (não lança)", async () => {
    const repo = new InMemorySecretPayloadRepository();
    expect(await repo.getActiveCiphertext(randomUUID())).toBeNull();
  });

  it("rotação concorrente (concurrent-rotation): duas escritas em paralelo produzem v2/v3 sequenciais, nunca duas ativas", async () => {
    const repo = new InMemorySecretPayloadRepository();
    const encryption = new FakeSecretEncryptionProvider();
    const secretReferenceId = randomUUID();
    await repo.writeVersion(secretReferenceId, await encryption.encrypt("valor-v1"));

    const [a, b] = await Promise.all([
      repo.writeVersion(secretReferenceId, await encryption.encrypt("valor-concorrente-a")),
      repo.writeVersion(secretReferenceId, await encryption.encrypt("valor-concorrente-b")),
    ]);

    // As duas chamadas produzem versões DISTINTAS (2 e 3, em alguma ordem) —
    // nunca a mesma versão duas vezes, nunca duas ativas simultâneas.
    expect(new Set([a.version, b.version]).size).toBe(2);
    expect([a.version, b.version].sort()).toEqual([2, 3]);

    const all = await repo.listVersionMetadata(secretReferenceId);
    expect(all.filter((v) => v.status === "active")).toHaveLength(1);
    expect(all).toHaveLength(3);
  });

  it("cada instância começa vazia — nunca compartilha estado", async () => {
    const repoA = new InMemorySecretPayloadRepository();
    const repoB = new InMemorySecretPayloadRepository();
    const encryption = new FakeSecretEncryptionProvider();
    const secretReferenceId = randomUUID();
    await repoA.writeVersion(secretReferenceId, await encryption.encrypt("valor"));
    expect(await repoB.getActiveCiphertext(secretReferenceId)).toBeNull();
  });
});
