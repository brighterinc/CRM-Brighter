import { describe, expect, it } from "vitest";

import {
  createDefaultProvisioningAdapterRegistry,
  NoopProvisioningProviderAdapter,
  ProvisioningAdapterAlreadyRegisteredError,
  ProvisioningAdapterRegistry,
  PROVISIONING_PROVIDERS,
  SupabaseProvisioningProviderAdapter,
} from "@/lib/provisioning-adapters";

describe("ProvisioningAdapterRegistry", () => {
  it("registra e encontra um adapter por providerId", () => {
    const registry = new ProvisioningAdapterRegistry();
    registry.registerAdapter(NoopProvisioningProviderAdapter);
    expect(registry.findAdapter("noop")).toBe(NoopProvisioningProviderAdapter);
    expect(registry.findAdapter("supabase")).toBeUndefined();
  });

  it("rejeita registrar dois adapters pro mesmo provider", () => {
    const registry = new ProvisioningAdapterRegistry();
    registry.registerAdapter(SupabaseProvisioningProviderAdapter);
    expect(() => registry.registerAdapter(SupabaseProvisioningProviderAdapter)).toThrow(ProvisioningAdapterAlreadyRegisteredError);
  });

  it("unregisterAdapter remove o adapter", () => {
    const registry = new ProvisioningAdapterRegistry();
    registry.registerAdapter(NoopProvisioningProviderAdapter);
    registry.unregisterAdapter("noop");
    expect(registry.findAdapter("noop")).toBeUndefined();
  });

  it("listAdapters é determinístico — sempre na ordem canônica de PROVISIONING_PROVIDERS", () => {
    const registry = new ProvisioningAdapterRegistry();
    registry.registerAdapter(SupabaseProvisioningProviderAdapter);
    registry.registerAdapter(NoopProvisioningProviderAdapter);
    const ids = registry.listAdapters().map((a) => a.providerId);
    expect(ids).toEqual(["noop", "supabase"]);
  });

  it("createDefaultProvisioningAdapterRegistry registra os 14 providers", () => {
    const registry = createDefaultProvisioningAdapterRegistry();
    const ids = registry.listAdapters().map((a) => a.providerId);
    expect(ids).toEqual(PROVISIONING_PROVIDERS);
    expect(ids).toHaveLength(14);
  });

  it("cada chamada de createDefaultProvisioningAdapterRegistry devolve uma instância NOVA", () => {
    const a = createDefaultProvisioningAdapterRegistry();
    const b = createDefaultProvisioningAdapterRegistry();
    expect(a).not.toBe(b);
    a.unregisterAdapter("supabase");
    expect(b.findAdapter("supabase")).toBeDefined();
  });

  describe("resolveAdapterForStep", () => {
    it("resolve etapa mapeada com adapter registrado", () => {
      const registry = createDefaultProvisioningAdapterRegistry();
      const resolution = registry.resolveAdapterForStep("create_supabase_project", "vps");
      expect(resolution.status).toBe("resolved");
      if (resolution.status === "resolved") {
        expect(resolution.provider).toBe("supabase");
        expect(resolution.operation).toBe("project.create");
      }
    });

    it("etapa sem provider nesta Foundation devolve unmapped", () => {
      const registry = createDefaultProvisioningAdapterRegistry();
      const resolution = registry.resolveAdapterForStep("validate_tenant", "vps");
      expect(resolution.status).toBe("unmapped");
    });

    it("etapa mapeada sem adapter registrado devolve missing_adapter", () => {
      const registry = createDefaultProvisioningAdapterRegistry();
      registry.unregisterAdapter("supabase");
      const resolution = registry.resolveAdapterForStep("create_supabase_project", "vps");
      expect(resolution.status).toBe("missing_adapter");
    });

    it("configure_domain resolve pra dns quando target=vps e pra vercel quando target=vercel", () => {
      const registry = createDefaultProvisioningAdapterRegistry();
      const vpsResolution = registry.resolveAdapterForStep("configure_domain", "vps");
      const vercelResolution = registry.resolveAdapterForStep("configure_domain", "vercel");
      expect(vpsResolution.status).toBe("resolved");
      expect(vercelResolution.status).toBe("resolved");
      if (vpsResolution.status === "resolved") expect(vpsResolution.provider).toBe("dns");
      if (vercelResolution.status === "resolved") expect(vercelResolution.provider).toBe("vercel");
    });

    it("configure_ssl não tem adapter quando target=vercel (SSL automático do host)", () => {
      const registry = createDefaultProvisioningAdapterRegistry();
      const resolution = registry.resolveAdapterForStep("configure_ssl", "vercel");
      expect(resolution.status).toBe("unmapped");
    });
  });
});
