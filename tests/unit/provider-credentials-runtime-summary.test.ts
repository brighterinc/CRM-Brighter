import { describe, expect, it } from "vitest";

import { generateProviderCredentialsRuntimeSummary, type ProviderCredentialsRuntimeSummaryInput } from "@/lib/provider-credentials-runtime/summary";
import { CredentialLeakDetectedError } from "@/lib/provider-credentials-runtime/errors";
import { ResolvedCredential } from "@/lib/provider-credentials-runtime/types";

function baseInput(): ProviderCredentialsRuntimeSummaryInput {
  return {
    vaultProviderHealth: [
      { id: "noop", available: false, message: "sempre desligado" },
      { id: "in_memory", available: true, message: "1 valor semeado" },
      { id: "environment", available: false, message: "desabilitado" },
    ],
    readiness: [
      {
        installationId: "install-1",
        provider: "fake",
        connectionStatus: "available",
        secretReferenceId: "sr-1",
        secretReferenceStatus: "active",
        vaultProvider: "in_memory",
        runtimeVaultProviderAvailable: true,
        ready: true,
        blockers: [],
        warnings: [],
      },
    ],
    overview: { total: 1, ready: 1, missing: 0, blocked: 0 },
  };
}

describe("generateProviderCredentialsRuntimeSummary", () => {
  it("formato JSON é JSON válido e contém os campos esperados", () => {
    const json = generateProviderCredentialsRuntimeSummary(baseInput(), "json");
    const parsed = JSON.parse(json);
    expect(parsed.overview).toEqual({ total: 1, ready: 1, missing: 0, blocked: 0 });
    expect(parsed.vaultProviders).toHaveLength(3);
  });

  it("formato Markdown contém as seções esperadas", () => {
    const markdown = generateProviderCredentialsRuntimeSummary(baseInput(), "markdown");
    expect(markdown).toContain("# Provider Credentials Runtime — Summary");
    expect(markdown).toContain("## Vault providers");
    expect(markdown).toContain("## Readiness por instalação/provider");
    expect(markdown).toContain("## Próxima ação");
  });

  it("nextAction sinaliza credenciais faltando quando overview.missing > 0", () => {
    const input = { ...baseInput(), overview: { total: 2, ready: 1, missing: 1, blocked: 0 } };
    const json = JSON.parse(generateProviderCredentialsRuntimeSummary(input, "json"));
    expect(json.nextAction).toContain("faltando");
  });

  it("lança CredentialLeakDetectedError se um ResolvedCredential vazar pro input (fail-closed, nunca formata)", () => {
    const credential = new ResolvedCredential(
      "value",
      { secretReferenceId: "sr-1", provider: "fake", secretType: "api_key", vaultProvider: "in_memory", version: 1 },
      false,
    );
    const dirty = { ...baseInput(), scenarioResults: [{ scenario: "healthy", outcome: "allowed", message: "ok", details: { leaked: credential } }] };
    expect(() => generateProviderCredentialsRuntimeSummary(dirty as never, "json")).toThrow(CredentialLeakDetectedError);
  });

  it("inclui cenários de simulação quando fornecidos", () => {
    const input = { ...baseInput(), scenarioResults: [{ scenario: "healthy" as const, outcome: "allowed" as const, message: "ok", details: {} }] };
    const markdown = generateProviderCredentialsRuntimeSummary(input, "markdown");
    expect(markdown).toContain("## Cenários de simulação");
    expect(markdown).toContain("healthy");
  });
});
