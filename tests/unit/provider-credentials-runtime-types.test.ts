import { describe, expect, it } from "vitest";

import {
  CredentialAlreadyConsumedError,
  CredentialAlreadyReleasedError,
  containsResolvedCredential,
  isResolvedCredential,
  ResolvedCredential,
} from "@/lib/provider-credentials-runtime/types";

const META = {
  secretReferenceId: "sr-1",
  provider: "fake" as const,
  secretType: "api_key" as const,
  vaultProvider: "in_memory" as const,
  version: 1,
};

describe("ResolvedCredential", () => {
  it("entrega o valor via .use() e nunca por propriedade direta", () => {
    const credential = new ResolvedCredential("super-secret-value", META, false);
    expect(credential.use((v) => v)).toBe("super-secret-value");
    expect((credential as unknown as Record<string, unknown>).value).toBeUndefined();
    expect(Object.keys(credential)).not.toContain("value");
  });

  it("lança CredentialAlreadyConsumedError na segunda chamada de .use() quando singleUse", () => {
    const credential = new ResolvedCredential("v", META, true);
    expect(credential.use((v) => v)).toBe("v");
    expect(() => credential.use((v) => v)).toThrow(CredentialAlreadyConsumedError);
  });

  it("permite múltiplas chamadas de .use() quando singleUse é false", () => {
    const credential = new ResolvedCredential("v", META, false);
    expect(credential.use((v) => v)).toBe("v");
    expect(credential.use((v) => v)).toBe("v");
  });

  it(".release() zera o buffer — .use() depois lança CredentialAlreadyReleasedError", () => {
    const credential = new ResolvedCredential("v", META, false);
    credential.release();
    expect(credential.released).toBe(true);
    expect(() => credential.use((v) => v)).toThrow(CredentialAlreadyReleasedError);
  });

  it(".release() é idempotente — chamar duas vezes não lança", () => {
    const credential = new ResolvedCredential("v", META, false);
    credential.release();
    expect(() => credential.release()).not.toThrow();
  });

  it("JSON.stringify nunca inclui o valor", () => {
    const credential = new ResolvedCredential("super-secret-value", META, false);
    const json = JSON.stringify({ credential });
    expect(json).not.toContain("super-secret-value");
    expect(json).toContain("redacted");
  });

  it("util.inspect (console.log) nunca inclui o valor", async () => {
    const { inspect } = await import("node:util");
    const credential = new ResolvedCredential("super-secret-value", META, false);
    const inspected = inspect(credential);
    expect(inspected).not.toContain("super-secret-value");
  });

  it("Object.keys/spread nunca expõe o buffer interno (campo `#` é privado de verdade)", () => {
    const credential = new ResolvedCredential("super-secret-value", META, false);
    const spread = { ...credential };
    expect(JSON.stringify(spread)).not.toContain("super-secret-value");
    for (const key of Object.keys(credential)) {
      expect(key).not.toMatch(/buffer/i);
    }
  });
});

describe("containsResolvedCredential / isResolvedCredential", () => {
  it("detecta um ResolvedCredential no topo do objeto", () => {
    const credential = new ResolvedCredential("v", META, false);
    expect(isResolvedCredential(credential)).toBe(true);
    expect(containsResolvedCredential(credential)).toBe(true);
  });

  it("detecta um ResolvedCredential embutido em profundidade arbitrária, mesmo sob chave inocente", () => {
    const credential = new ResolvedCredential("v", META, false);
    const nested = { result: { ok: true, data: { innocentLookingKey: credential } } };
    expect(containsResolvedCredential(nested)).toBe(true);
  });

  it("detecta um ResolvedCredential dentro de um array", () => {
    const credential = new ResolvedCredential("v", META, false);
    expect(containsResolvedCredential([1, 2, { list: [credential] }])).toBe(true);
  });

  it("não detecta falso positivo em objeto comum", () => {
    expect(containsResolvedCredential({ a: 1, b: { c: "value" } })).toBe(false);
    expect(containsResolvedCredential(null)).toBe(false);
    expect(containsResolvedCredential("string")).toBe(false);
  });

  it("não lança em estrutura circular (proteção contra loop infinito)", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => containsResolvedCredential(circular)).not.toThrow();
    expect(containsResolvedCredential(circular)).toBe(false);
  });
});
