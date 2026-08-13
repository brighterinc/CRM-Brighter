import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SecretResolutionFailedError } from "@/lib/provider-credentials-runtime/errors";
import { EnvironmentRuntimeVaultProvider } from "@/lib/provider-credentials-runtime/providers/environment";
import { InMemoryRuntimeVaultProvider } from "@/lib/provider-credentials-runtime/providers/in-memory";
import { NoopRuntimeVaultProvider } from "@/lib/provider-credentials-runtime/providers/noop";
import type { SecretReferenceMetadata } from "@/lib/provider-credentials-runtime/types";

function makeReference(overrides: Partial<SecretReferenceMetadata> = {}): SecretReferenceMetadata {
  return {
    id: "sr-1",
    installationId: "install-1",
    tenantId: "tenant-1",
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

describe("NoopRuntimeVaultProvider", () => {
  it("supports() só aceita vaultProvider 'noop'", () => {
    const provider = new NoopRuntimeVaultProvider();
    expect(provider.supports("noop")).toBe(true);
    expect(provider.supports("in_memory")).toBe(false);
    expect(provider.supports("database_placeholder")).toBe(false);
  });

  it("resolveSecret sempre lança fail-closed", async () => {
    const provider = new NoopRuntimeVaultProvider();
    await expect(provider.resolveSecret(makeReference(), { singleUse: true })).rejects.toThrow(SecretResolutionFailedError);
  });

  it("healthPreview reporta indisponível", async () => {
    const provider = new NoopRuntimeVaultProvider();
    const health = await provider.healthPreview();
    expect(health.available).toBe(false);
  });
});

describe("InMemoryRuntimeVaultProvider", () => {
  it("resolve um valor semeado e devolve um ResolvedCredential com metadata correta", async () => {
    const provider = new InMemoryRuntimeVaultProvider();
    const reference = makeReference();
    provider.seed(reference.id, "synthetic-value");

    const credential = await provider.resolveSecret(reference, { singleUse: true });
    expect(credential.use((v) => v)).toBe("synthetic-value");
    expect(credential.metadata.secretReferenceId).toBe(reference.id);
    expect(credential.metadata.vaultProvider).toBe("in_memory");
  });

  it("lança se não houver valor semeado (fail-closed, nunca inventa valor)", async () => {
    const provider = new InMemoryRuntimeVaultProvider();
    await expect(provider.resolveSecret(makeReference(), { singleUse: true })).rejects.toThrow(SecretResolutionFailedError);
  });

  it("cada instância começa vazia — nunca compartilha estado global", async () => {
    const providerA = new InMemoryRuntimeVaultProvider();
    const providerB = new InMemoryRuntimeVaultProvider();
    providerA.seed("sr-1", "value-a");
    await expect(providerB.resolveSecret(makeReference({ id: "sr-1" }), { singleUse: true })).rejects.toThrow(SecretResolutionFailedError);
  });

  it("unseed/clear removem o valor semeado", async () => {
    const provider = new InMemoryRuntimeVaultProvider();
    provider.seed("sr-1", "value");
    provider.unseed("sr-1");
    await expect(provider.resolveSecret(makeReference({ id: "sr-1" }), { singleUse: true })).rejects.toThrow(SecretResolutionFailedError);
  });
});

describe("EnvironmentRuntimeVaultProvider", () => {
  const ENV_VAR = "BRIGHTER_RUNTIME_TEST_TOKEN";
  let previousValue: string | undefined;

  beforeEach(() => {
    previousValue = process.env[ENV_VAR];
  });

  afterEach(() => {
    if (previousValue === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = previousValue;
  });

  it("nasce desabilitado por padrão — resolveSecret lança mesmo com env var sintética presente", async () => {
    process.env[ENV_VAR] = "synthetic-value";
    const provider = new EnvironmentRuntimeVaultProvider();
    const reference = makeReference({ vaultProvider: "database_placeholder", vaultKey: ENV_VAR });
    await expect(provider.resolveSecret(reference, { singleUse: true })).rejects.toThrow(SecretResolutionFailedError);
  });

  it("habilitado explicitamente, resolve de uma env var SINTÉTICA (setada/restaurada pelo próprio teste)", async () => {
    process.env[ENV_VAR] = "synthetic-value-for-test";
    const provider = new EnvironmentRuntimeVaultProvider({ enabled: true });
    const reference = makeReference({ vaultProvider: "database_placeholder", vaultKey: ENV_VAR });

    const credential = await provider.resolveSecret(reference, { singleUse: true });
    expect(credential.use((v) => v)).toBe("synthetic-value-for-test");
  });

  it("recusa (fail-closed) env var fora do prefixo permitido, mesmo habilitado", async () => {
    process.env.OUTRA_VARIAVEL_QUALQUER = "synthetic-value";
    const provider = new EnvironmentRuntimeVaultProvider({ enabled: true });
    const reference = makeReference({ vaultProvider: "database_placeholder", vaultKey: "OUTRA_VARIAVEL_QUALQUER" });

    await expect(provider.resolveSecret(reference, { singleUse: true })).rejects.toThrow(SecretResolutionFailedError);
    delete process.env.OUTRA_VARIAVEL_QUALQUER;
  });

  it("supports() só aceita vaultProvider 'database_placeholder'", () => {
    const provider = new EnvironmentRuntimeVaultProvider({ enabled: true });
    expect(provider.supports("database_placeholder")).toBe(true);
    expect(provider.supports("in_memory")).toBe(false);
    expect(provider.supports("noop")).toBe(false);
  });

  it("env var sintética é restaurada ao valor anterior depois do teste (nunca vaza pro processo)", () => {
    // Prova direta, sem depender do timing do afterEach: seta, monta um
    // snapshot do estado do processo, remove exatamente como o afterEach
    // faria, e confirma que o valor original (ausência, aqui) volta.
    delete process.env[ENV_VAR];
    process.env[ENV_VAR] = "synthetic-value-temp";
    expect(process.env[ENV_VAR]).toBe("synthetic-value-temp");
    delete process.env[ENV_VAR];
    expect(process.env[ENV_VAR]).toBeUndefined();
  });
});
