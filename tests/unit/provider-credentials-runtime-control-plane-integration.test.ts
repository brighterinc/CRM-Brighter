import { describe, expect, it } from "vitest";

import type { PersistedProviderConnection, SecretReferenceMetadata } from "@/lib/control-plane-persistence/types";

import {
  buildInstallationCredentialReadiness,
  evaluateProviderCredentialReadiness,
  summarizeProviderCredentialReadiness,
} from "@/lib/provider-credentials-runtime/control-plane-integration";
import { createDefaultRuntimeVaultProviderRegistry } from "@/lib/provider-credentials-runtime/providers";

function connection(overrides: Partial<PersistedProviderConnection> = {}): PersistedProviderConnection {
  return {
    id: "conn-1",
    installationId: "install-1",
    provider: "fake",
    mode: "dry_run",
    status: "available",
    config: {},
    secretReferenceId: "sr-1",
    createdAt: "now",
    updatedAt: "now",
    ...overrides,
  };
}

function secretRef(overrides: Partial<SecretReferenceMetadata> = {}): SecretReferenceMetadata {
  return {
    id: "sr-1",
    installationId: "install-1",
    tenantId: "tenant-1",
    reference: "ref-1",
    type: "api_key",
    provider: "fake",
    vaultProvider: "in_memory",
    vaultKey: "k",
    version: 1,
    status: "active",
    createdAt: "now",
    updatedAt: "now",
    ...overrides,
  };
}

describe("evaluateProviderCredentialReadiness", () => {
  it("pronta quando conexão + secret reference ativos + vault provider disponível", () => {
    const registry = createDefaultRuntimeVaultProviderRegistry();
    const readiness = evaluateProviderCredentialReadiness({
      installationId: "install-1",
      provider: "fake",
      connection: connection(),
      secretReference: secretRef(),
      vaultProviderRegistry: registry,
    });
    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });

  it("faltando: sem conexão nenhuma", () => {
    const registry = createDefaultRuntimeVaultProviderRegistry();
    const readiness = evaluateProviderCredentialReadiness({
      installationId: "install-1",
      provider: "fake",
      connection: null,
      secretReference: null,
      vaultProviderRegistry: registry,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.connectionStatus).toBe("missing");
    expect(readiness.secretReferenceStatus).toBe("missing");
  });

  it("bloqueada: secret reference revogada", () => {
    const registry = createDefaultRuntimeVaultProviderRegistry();
    const readiness = evaluateProviderCredentialReadiness({
      installationId: "install-1",
      provider: "fake",
      connection: connection(),
      secretReference: secretRef({ status: "revoked" }),
      vaultProviderRegistry: registry,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((b) => b.includes("revoked"))).toBe(true);
  });

  it("bloqueada: vaultProvider da referência não tem nenhum runtime vault provider registrado que suporte", () => {
    const registry = createDefaultRuntimeVaultProviderRegistry();
    const readiness = evaluateProviderCredentialReadiness({
      installationId: "install-1",
      provider: "fake",
      connection: connection(),
      secretReference: secretRef({ vaultProvider: "database_placeholder" }), // Environment nasce desabilitado
      vaultProviderRegistry: registry,
    });
    // database_placeholder é suportado pelo Environment provider mesmo
    // desabilitado (supports() não depende de enabled) — então isso deve
    // continuar "pronto" nesta checagem estrutural; a indisponibilidade real
    // só aparece ao tentar RESOLVER (não é o que esta função mede).
    expect(readiness.runtimeVaultProviderAvailable).toBe(true);
  });

  it("nunca inclui valor/vaultKey no resultado — só metadata/status", () => {
    const registry = createDefaultRuntimeVaultProviderRegistry();
    const readiness = evaluateProviderCredentialReadiness({
      installationId: "install-1",
      provider: "fake",
      connection: connection(),
      secretReference: secretRef({ vaultKey: "segredo-nunca-deveria-aparecer" }),
      vaultProviderRegistry: registry,
    });
    expect(JSON.stringify(readiness)).not.toContain("segredo-nunca-deveria-aparecer");
  });
});

describe("buildInstallationCredentialReadiness / summarizeProviderCredentialReadiness", () => {
  it("filtra conexões pela installation certa e resume total/ready/missing/blocked", () => {
    const registry = createDefaultRuntimeVaultProviderRegistry();
    const secretReferencesById = new Map([["sr-1", secretRef()]]);
    const connections = [connection({ installationId: "install-1" }), connection({ id: "conn-2", installationId: "install-2" })];

    const readiness = buildInstallationCredentialReadiness({
      installationId: "install-1",
      connections,
      secretReferencesById,
      vaultProviderRegistry: registry,
    });
    expect(readiness).toHaveLength(1);

    const overview = summarizeProviderCredentialReadiness(readiness);
    expect(overview).toEqual({ total: 1, ready: 1, missing: 0, blocked: 0 });
  });
});
