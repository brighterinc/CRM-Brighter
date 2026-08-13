import { describe, expect, it } from "vitest";

import type { ProvisioningAdapterCapability } from "@/lib/provisioning-adapters/types";

import { credentialRequirementFromCapability, resolveCredentialRequirementForAdapter } from "@/lib/provider-credentials-runtime/adapter-integration";

function capability(overrides: Partial<ProvisioningAdapterCapability> = {}): ProvisioningAdapterCapability {
  return {
    id: "fake.simulate",
    provider: "fake",
    operation: "simulate",
    description: "desc",
    supportedPlans: ["lite", "pro", "dedicated"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
    realExecutionAvailable: false,
    ...overrides,
  };
}

describe("resolveCredentialRequirementForAdapter", () => {
  it("devolve o requisito declarado no catálogo real pra fake.simulate", () => {
    const requirement = resolveCredentialRequirementForAdapter("fake", "simulate");
    expect(requirement).toEqual({ purpose: "api_call", secretType: "api_key" });
  });

  it("devolve null pra operação sem capability declarada", () => {
    expect(resolveCredentialRequirementForAdapter("fake", "operacao-inexistente")).toBeNull();
  });
});

describe("credentialRequirementFromCapability", () => {
  it("null se a capability não declarou requiredCredentialPurpose", () => {
    expect(credentialRequirementFromCapability(capability())).toBeNull();
  });

  it("null se a capability é null/undefined", () => {
    expect(credentialRequirementFromCapability(null)).toBeNull();
    expect(credentialRequirementFromCapability(undefined)).toBeNull();
  });

  it("converte purpose/secretType válidos", () => {
    const requirement = credentialRequirementFromCapability(
      capability({ requiredCredentialPurpose: "deploy", requiredSecretType: "database_password" }),
    );
    expect(requirement).toEqual({ purpose: "deploy", secretType: "database_password" });
  });

  it("trata valor fora do vocabulário como 'nenhum requisito válido' (nunca deixa passar um valor adulterado)", () => {
    const requirement = credentialRequirementFromCapability(capability({ requiredCredentialPurpose: "algo_inventado" }));
    expect(requirement).toBeNull();
  });

  it("secretType fora do vocabulário vira undefined, mas o purpose válido ainda é respeitado", () => {
    const requirement = credentialRequirementFromCapability(
      capability({ requiredCredentialPurpose: "deploy", requiredSecretType: "algo_inventado" }),
    );
    expect(requirement).toEqual({ purpose: "deploy", secretType: undefined });
  });
});
