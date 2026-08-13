import { describe, expect, it } from "vitest";

import { RuntimeVaultProviderAlreadyRegisteredError, RuntimeVaultProviderNotFoundError } from "@/lib/provider-credentials-runtime/errors";
import { RuntimeVaultProviderRegistry } from "@/lib/provider-credentials-runtime/registry";
import { createDefaultRuntimeVaultProviderRegistry, InMemoryRuntimeVaultProvider, NoopRuntimeVaultProvider } from "@/lib/provider-credentials-runtime/providers";

describe("RuntimeVaultProviderRegistry", () => {
  it("registra e encontra providers por id", () => {
    const registry = new RuntimeVaultProviderRegistry();
    const provider = new InMemoryRuntimeVaultProvider();
    registry.registerProvider(provider);
    expect(registry.findProvider("in_memory")).toBe(provider);
    expect(registry.findProvider("noop")).toBeUndefined();
  });

  it("lança ao registrar dois providers com o mesmo id", () => {
    const registry = new RuntimeVaultProviderRegistry();
    registry.registerProvider(new InMemoryRuntimeVaultProvider());
    expect(() => registry.registerProvider(new InMemoryRuntimeVaultProvider())).toThrow(RuntimeVaultProviderAlreadyRegisteredError);
  });

  it("resolveProviderForVault acha o provider certo pelo vaultProvider suportado", () => {
    const registry = createDefaultRuntimeVaultProviderRegistry();
    expect(registry.resolveProviderForVault("noop")).toBeInstanceOf(NoopRuntimeVaultProvider);
    expect(registry.resolveProviderForVault("in_memory")).toBeInstanceOf(InMemoryRuntimeVaultProvider);
  });

  it("resolveProviderForVault lança fail-closed (RuntimeVaultProviderNotFoundError) se nenhum provider suporta", () => {
    const registry = new RuntimeVaultProviderRegistry();
    expect(() => registry.resolveProviderForVault("in_memory")).toThrow(RuntimeVaultProviderNotFoundError);
  });

  it("listProviders devolve ordem canônica, independente da ordem de registro", () => {
    const registry = new RuntimeVaultProviderRegistry();
    registry.registerProvider(new InMemoryRuntimeVaultProvider());
    registry.registerProvider(new NoopRuntimeVaultProvider());
    expect(registry.listProviders().map((p) => p.id)).toEqual(["noop", "in_memory"]);
  });

  it("healthPreview agrega o preview de todos os providers registrados", async () => {
    const registry = createDefaultRuntimeVaultProviderRegistry();
    const health = await registry.healthPreview();
    expect(health).toHaveLength(3);
    expect(health.map((h) => h.id).sort()).toEqual(["environment", "in_memory", "noop"]);
  });

  it("createDefaultRuntimeVaultProviderRegistry nasce com EnvironmentRuntimeVaultProvider desabilitado (default seguro)", async () => {
    const registry = createDefaultRuntimeVaultProviderRegistry();
    const health = await registry.healthPreview();
    const env = health.find((h) => h.id === "environment");
    expect(env?.available).toBe(false);
  });
});
