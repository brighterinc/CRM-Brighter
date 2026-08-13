import { describe, expect, it } from "vitest";

import { CredentialLeakDetectedError } from "@/lib/provider-credentials-runtime/errors";
import { assertNoCredentialLeak, assertNoEmbeddedCredential, sanitizeCredentialRuntimePayload } from "@/lib/provider-credentials-runtime/sanitization";
import { ResolvedCredential } from "@/lib/provider-credentials-runtime/types";

const META = { secretReferenceId: "sr-1", provider: "fake" as const, secretType: "api_key" as const, vaultProvider: "in_memory" as const, version: 1 };

describe("assertNoCredentialLeak", () => {
  it("passa em payload limpo", () => {
    expect(() => assertNoCredentialLeak({ provider: "fake", status: "active" }, "ctx")).not.toThrow();
  });

  it("lança em payload com chave sensível do denylist geral (token/password/secret/etc.)", () => {
    expect(() => assertNoCredentialLeak({ token: "abc" }, "ctx")).toThrow(CredentialLeakDetectedError);
    expect(() => assertNoCredentialLeak({ apiKey: "abc" }, "ctx")).toThrow(CredentialLeakDetectedError);
  });

  it("lança em payload com chave extra deste runtime (vaultKey/plaintext)", () => {
    expect(() => assertNoCredentialLeak({ vaultKey: "abc" }, "ctx")).toThrow(CredentialLeakDetectedError);
    expect(() => assertNoCredentialLeak({ plaintext: "abc" }, "ctx")).toThrow(CredentialLeakDetectedError);
  });

  it("lança quando um ResolvedCredential está embutido, mesmo sem nome de chave sensível", () => {
    const credential = new ResolvedCredential("value", META, false);
    expect(() => assertNoCredentialLeak({ innocentKey: credential }, "ctx")).toThrow(CredentialLeakDetectedError);
  });

  it("nunca inclui o valor de segredo na mensagem de erro — só os dot-paths ofensivos", () => {
    try {
      assertNoCredentialLeak({ token: "the-actual-secret-value" }, "ctx");
      expect.fail("deveria ter lançado");
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialLeakDetectedError);
      expect((error as Error).message).not.toContain("the-actual-secret-value");
    }
  });
});

describe("assertNoEmbeddedCredential", () => {
  it("NÃO lança pra chaves como secretReferenceId (nomes legítimos deste domínio)", () => {
    expect(() => assertNoEmbeddedCredential({ secretReferenceId: "sr-1", secret_type: "api_key" }, "ctx")).not.toThrow();
  });

  it("lança se um ResolvedCredential estiver embutido em qualquer profundidade", () => {
    const credential = new ResolvedCredential("value", META, false);
    expect(() => assertNoEmbeddedCredential({ readiness: [{ nested: credential }] }, "ctx")).toThrow(CredentialLeakDetectedError);
  });
});

describe("sanitizeCredentialRuntimePayload", () => {
  it("remove chaves sensíveis silenciosamente (não lança)", () => {
    const result = sanitizeCredentialRuntimePayload({ token: "abc", ok: true, vaultKey: "x" }) as Record<string, unknown>;
    expect(result.token).toBeUndefined();
    expect(result.vaultKey).toBeUndefined();
    expect(result.ok).toBe(true);
  });
});
