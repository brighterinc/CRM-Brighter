import { describe, expect, it } from "vitest";

import { generateDeploymentManifest } from "@/lib/deployment";
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import type { Tenant } from "@/lib/tenants/types";

function baseTenant(overrides: Partial<Tenant> = {}): Tenant {
  const now = new Date().toISOString();
  return {
    id: "11111111-1111-4111-8111-111111111111",
    clientName: "Empresa Exemplo",
    clientSlug: "empresa-exemplo",
    domain: "crm.empresa.com.br",
    plan: "lite",
    requestedModules: ["core.contacts"],
    enabledModules: [],
    branding: { appName: "Empresa Exemplo" },
    commercialStatus: "lead",
    technicalStatus: "draft",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function manifestFor(tenant: Tenant, overrides: Partial<Parameters<typeof generateDeploymentManifest>[0]> = {}) {
  return generateDeploymentManifest({
    clientName: tenant.clientName,
    clientSlug: tenant.clientSlug,
    domain: tenant.domain,
    plan: tenant.plan,
    requestedModules: tenant.requestedModules,
    branding: tenant.branding,
    ...overrides,
  });
}

describe("attachDeploymentManifest", () => {
  it("anexa com sucesso quando manifesto e tenant batem", () => {
    const tenant = baseTenant();
    const manifest = manifestFor(tenant);

    const result = attachDeploymentManifest(tenant, manifest);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenant.manifest).toBe(manifest);
      expect(result.tenant.enabledModules).toEqual(manifest.enabledModules);
      expect(result.tenant.updatedAt).not.toBe(tenant.updatedAt);
    }
  });

  it("rejeita quando o slug do manifesto diverge", () => {
    const tenant = baseTenant();
    const manifest = manifestFor(tenant, { clientSlug: "outro-slug" });

    const result = attachDeploymentManifest(tenant, manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.field === "clientSlug")).toBe(true);
  });

  it("rejeita quando o domínio do manifesto diverge", () => {
    const tenant = baseTenant();
    const manifest = manifestFor(tenant, { domain: "outro.com.br" });

    const result = attachDeploymentManifest(tenant, manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.field === "domain")).toBe(true);
  });

  it("rejeita quando o plano do manifesto diverge", () => {
    const tenant = baseTenant();
    const manifest = manifestFor(tenant, { plan: "pro" });

    const result = attachDeploymentManifest(tenant, manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.field === "plan")).toBe(true);
  });

  it("rejeita quando os módulos pedidos divergem", () => {
    const tenant = baseTenant();
    const manifest = manifestFor(tenant, { requestedModules: ["core.pipeline"] });

    const result = attachDeploymentManifest(tenant, manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.field === "requestedModules")).toBe(true);
  });

  it("rejeita quando branding.appName diverge", () => {
    const tenant = baseTenant();
    const manifest = manifestFor(tenant, { branding: { appName: "Outro Nome" } });

    const result = attachDeploymentManifest(tenant, manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.field === "branding.appName")).toBe(true);
  });

  it("rejeita quando o clientName do manifesto diverge", () => {
    const tenant = baseTenant();
    const manifest = manifestFor(tenant, { clientName: "Outro Cliente" });

    const result = attachDeploymentManifest(tenant, manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.field === "clientName")).toBe(true);
  });
});
