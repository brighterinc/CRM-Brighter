import { describe, expect, it } from "vitest";

import { validateProviderCredentialRequest } from "@/lib/provider-credentials-runtime/validation";
import type { ProviderCredentialRequest } from "@/lib/provider-credentials-runtime/types";

function baseRequest(): ProviderCredentialRequest {
  return {
    tenantId: "tenant-1",
    installationId: "install-1",
    provider: "fake",
    secretReferenceId: "sr-1",
    purpose: "api_call",
    operation: "simulate",
    requestedBy: "user-1",
    requestedAt: new Date().toISOString(),
    correlationId: "corr-1",
    singleUse: true,
  };
}

describe("validateProviderCredentialRequest", () => {
  it("aceita um request bem formado", () => {
    const result = validateProviderCredentialRequest(baseRequest());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejeita campos obrigatórios vazios", () => {
    const result = validateProviderCredentialRequest({ ...baseRequest(), tenantId: "", installationId: "  " });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("tenantId"))).toBe(true);
    expect(result.errors.some((e) => e.includes("installationId"))).toBe(true);
  });

  it("rejeita purpose fora do vocabulário fechado", () => {
    const result = validateProviderCredentialRequest({ ...baseRequest(), purpose: "not_a_real_purpose" as never });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("purpose"))).toBe(true);
  });

  it("rejeita requestedAt inválido", () => {
    const result = validateProviderCredentialRequest({ ...baseRequest(), requestedAt: "not-a-date" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("requestedAt"))).toBe(true);
  });

  it("rejeita correlationId ausente", () => {
    const result = validateProviderCredentialRequest({ ...baseRequest(), correlationId: "" });
    expect(result.valid).toBe(false);
  });

  it("aceita requestedBy null", () => {
    const result = validateProviderCredentialRequest({ ...baseRequest(), requestedBy: null });
    expect(result.valid).toBe(true);
  });
});
