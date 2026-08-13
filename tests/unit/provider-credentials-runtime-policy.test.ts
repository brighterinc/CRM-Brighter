import { describe, expect, it } from "vitest";

import { evaluateProviderCredentialAccess, type ProviderCredentialAccessContext } from "@/lib/provider-credentials-runtime/policy";
import type { ProviderCredentialRequest, SecretReferenceMetadata } from "@/lib/provider-credentials-runtime/types";

function request(overrides: Partial<ProviderCredentialRequest> = {}): ProviderCredentialRequest {
  return {
    tenantId: "tenant-a",
    installationId: "install-a",
    provider: "fake",
    secretReferenceId: "sr-1",
    purpose: "api_call",
    operation: "simulate",
    requestedBy: null,
    requestedAt: new Date().toISOString(),
    correlationId: "corr-1",
    singleUse: true,
    ...overrides,
  };
}

function secretRef(overrides: Partial<SecretReferenceMetadata> = {}): SecretReferenceMetadata {
  return {
    id: "sr-1",
    installationId: "install-a",
    tenantId: "tenant-a",
    reference: "ref-1",
    type: "api_key",
    provider: "fake",
    vaultProvider: "in_memory",
    vaultKey: "vault/key",
    version: 1,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fullContext(overrides: Partial<ProviderCredentialAccessContext> = {}): ProviderCredentialAccessContext {
  return {
    request: request(),
    secretReference: secretRef(),
    providerConnection: { id: "conn-1", installationId: "install-a", provider: "fake", status: "available" },
    installation: { id: "install-a", tenantId: "tenant-a", status: "active" },
    adapterRequirement: { purpose: "api_call", secretType: "api_key" },
    ...overrides,
  };
}

describe("evaluateProviderCredentialAccess — default deny", () => {
  it("nega quando TUDO está ausente (nunca allow-by-default)", () => {
    const decision = evaluateProviderCredentialAccess({
      request: request(),
      secretReference: null,
      providerConnection: null,
      installation: null,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toContain("secret_reference_not_found");
    expect(decision.blockers).toContain("provider_connection_not_found");
    expect(decision.blockers).toContain("installation_not_found");
  });

  it("permite quando tudo é válido e consistente", () => {
    const decision = evaluateProviderCredentialAccess(fullContext());
    expect(decision.allowed).toBe(true);
    expect(decision.blockers).toEqual([]);
  });

  it("auditMetadata nunca carrega vaultKey nem valor — só provider/purpose/operation/contadores", () => {
    const decision = evaluateProviderCredentialAccess(fullContext());
    expect(Object.keys(decision.auditMetadata).sort()).toEqual(["blockers_count", "operation", "provider", "purpose", "warnings_count"]);
  });
});

describe("evaluateProviderCredentialAccess — cross-tenant/installation", () => {
  it("nega cross-tenant mesmo com provider connection válida apontando pra referência de outro tenant", () => {
    const decision = evaluateProviderCredentialAccess(
      fullContext({
        request: request({ tenantId: "tenant-b", installationId: "install-b" }),
        providerConnection: { id: "conn-1", installationId: "install-b", provider: "fake", status: "available" },
        installation: { id: "install-b", tenantId: "tenant-b", status: "active" },
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toContain("cross_tenant_denied");
    expect(decision.blockers).toContain("cross_installation_denied");
  });

  it("nega se a installation pertence a outro tenant que não o do request", () => {
    const decision = evaluateProviderCredentialAccess(
      fullContext({ installation: { id: "install-a", tenantId: "tenant-outro", status: "active" } }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toContain("installation_tenant_mismatch");
  });

  it("permite secret 'platform-wide' (sem tenant/installation) pra qualquer tenant do provider certo", () => {
    const decision = evaluateProviderCredentialAccess(
      fullContext({ secretReference: secretRef({ provider: "platform", tenantId: null, installationId: null }) }),
    );
    // provider_mismatch não deveria disparar pra secret platform-wide mesmo
    // com request.provider "fake" !== secretReference.provider "platform".
    expect(decision.blockers).not.toContain("provider_mismatch");
    expect(decision.blockers).not.toContain("cross_tenant_denied");
  });
});

describe("evaluateProviderCredentialAccess — provider mismatch", () => {
  it("nega quando o provider da secret reference é diferente do provider do request", () => {
    const decision = evaluateProviderCredentialAccess(fullContext({ secretReference: secretRef({ provider: "supabase" }) }));
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toContain("provider_mismatch");
  });

  it("nega quando a provider connection é de outro provider", () => {
    const decision = evaluateProviderCredentialAccess(
      fullContext({ providerConnection: { id: "conn-1", installationId: "install-a", provider: "supabase", status: "available" } }),
    );
    expect(decision.blockers).toContain("provider_connection_provider_mismatch");
  });
});

describe("evaluateProviderCredentialAccess — status", () => {
  it("nega secret reference revogada/rotada/pendente", () => {
    for (const status of ["revoked", "rotated", "pending"] as const) {
      const decision = evaluateProviderCredentialAccess(fullContext({ secretReference: secretRef({ status }) }));
      expect(decision.allowed).toBe(false);
      expect(decision.blockers.some((b) => b.startsWith("secret_reference_not_active"))).toBe(true);
    }
  });

  it("nega provider connection indisponível", () => {
    const decision = evaluateProviderCredentialAccess(
      fullContext({ providerConnection: { id: "conn-1", installationId: "install-a", provider: "fake", status: "unavailable" } }),
    );
    expect(decision.allowed).toBe(false);
  });

  it("nega installation arquivada/em erro", () => {
    for (const status of ["archived", "error"]) {
      const decision = evaluateProviderCredentialAccess(fullContext({ installation: { id: "install-a", tenantId: "tenant-a", status } }));
      expect(decision.allowed).toBe(false);
      expect(decision.blockers.some((b) => b.startsWith("installation_blocked"))).toBe(true);
    }
  });
});

describe("evaluateProviderCredentialAccess — purpose/operation", () => {
  it("nega quando o purpose do request não bate com o exigido pelo adapter", () => {
    const decision = evaluateProviderCredentialAccess(
      fullContext({ request: request({ purpose: "messaging" }), adapterRequirement: { purpose: "api_call" } }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toContain("purpose_not_authorized");
  });

  it("nega quando o secretType não bate com o exigido pelo adapter", () => {
    const decision = evaluateProviderCredentialAccess(
      fullContext({ adapterRequirement: { purpose: "api_call", secretType: "database_password" } }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toContain("secret_type_mismatch");
  });

  it("gera warning (não blocker) quando nenhum adapter declarou requisito", () => {
    const decision = evaluateProviderCredentialAccess(fullContext({ adapterRequirement: null }));
    expect(decision.allowed).toBe(true);
    expect(decision.warnings).toContain("no_adapter_credential_requirement_declared");
  });
});
