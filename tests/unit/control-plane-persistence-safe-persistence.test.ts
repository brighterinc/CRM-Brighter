import { describe, expect, it } from "vitest";

import { assertSafePersistencePayload, UnsafePersistencePayloadError } from "@/lib/control-plane-persistence/safe-persistence";

describe("assertSafePersistencePayload", () => {
  it("não lança para payload limpo", () => {
    expect(() => assertSafePersistencePayload({ provider: "supabase", region: "sa-east-1" }, "ctx")).not.toThrow();
  });

  it.each([
    ["password"],
    ["token"],
    ["apiKey"],
    ["api_key"],
    ["secret"],
    ["serviceRoleKey"],
    ["service_role"],
    ["privateKey"],
    ["databaseUrl"],
    ["connectionString"],
    ["sshKey"],
    ["authorization"],
    ["cookie"],
    ["session"],
    ["refreshToken"],
    ["accessToken"],
  ])("recusa payload de topo com chave sensível: %s", (key) => {
    expect(() => assertSafePersistencePayload({ [key]: "valor-secreto" }, "ctx")).toThrow(UnsafePersistencePayloadError);
  });

  it("detecta chave sensível em qualquer profundidade (objeto aninhado)", () => {
    const payload = { a: { b: { c: { token: "xyz" } } } };
    expect(() => assertSafePersistencePayload(payload, "ctx")).toThrow(UnsafePersistencePayloadError);
  });

  it("detecta chave sensível dentro de array", () => {
    const payload = { items: [{ ok: true }, { apiKey: "xyz" }] };
    expect(() => assertSafePersistencePayload(payload, "ctx")).toThrow(UnsafePersistencePayloadError);
  });

  it("é case-insensitive e casa substring", () => {
    expect(() => assertSafePersistencePayload({ MyApiKeyBackup: "x" }, "ctx")).toThrow(UnsafePersistencePayloadError);
  });

  it("erro reporta os dot-paths ofendendo, não mensagem genérica", () => {
    try {
      assertSafePersistencePayload({ config: { nested: { token: "x" } } }, "meu-contexto");
      expect.fail("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(UnsafePersistencePayloadError);
      const typed = err as UnsafePersistencePayloadError;
      expect(typed.context).toBe("meu-contexto");
      expect(typed.offendingPaths).toContain("config.nested.token");
    }
  });

  it("nunca mascara — falha fechado mesmo com múltiplas chaves sensíveis", () => {
    try {
      assertSafePersistencePayload({ password: "a", token: "b", nested: { secret: "c" } }, "ctx");
      expect.fail("deveria ter lançado");
    } catch (err) {
      const typed = err as UnsafePersistencePayloadError;
      expect(typed.offendingPaths.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("valores primitivos e null/undefined não quebram", () => {
    expect(() => assertSafePersistencePayload(null, "ctx")).not.toThrow();
    expect(() => assertSafePersistencePayload(undefined, "ctx")).not.toThrow();
    expect(() => assertSafePersistencePayload("string solta", "ctx")).not.toThrow();
    expect(() => assertSafePersistencePayload(42, "ctx")).not.toThrow();
  });
});
