import { describe, expect, it } from "vitest";

import { generateDeploymentManifest } from "@/lib/deployment";
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import type { Tenant } from "@/lib/tenants/types";

import {
  detectCircularStepDependencies,
  validateStepCatalog,
  validateTenantManifestCompatibility,
  validateTenantReadinessForProvisioning,
  type ProvisioningStepDefinition,
} from "@/lib/provisioning";

function baseTenant(overrides: Partial<Tenant> = {}): Tenant {
  const now = new Date().toISOString();
  return {
    id: "11111111-1111-4111-8111-111111111111",
    clientName: "Empresa Exemplo",
    clientSlug: "empresa-exemplo",
    domain: "crm.empresa.com.br",
    plan: "lite",
    requestedModules: ["core.contacts", "core.pipeline"],
    enabledModules: [],
    branding: { appName: "Empresa Exemplo", supportEmail: "suporte@empresa-exemplo.com.br" },
    commercialStatus: "lead",
    technicalStatus: "draft",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function manifestFor(tenant: Tenant) {
  return generateDeploymentManifest({
    clientName: tenant.clientName,
    clientSlug: tenant.clientSlug,
    domain: tenant.domain,
    plan: tenant.plan,
    requestedModules: tenant.requestedModules,
    branding: tenant.branding,
  });
}

describe("validateTenantManifestCompatibility", () => {
  it("devolve [] quando tenant e manifesto batem", () => {
    const tenant = baseTenant();
    const manifest = manifestFor(tenant);
    expect(validateTenantManifestCompatibility(tenant, manifest)).toEqual([]);
  });

  it("devolve blocker quando slug diverge", () => {
    const tenant = baseTenant();
    const manifest = generateDeploymentManifest({
      clientName: tenant.clientName,
      clientSlug: "outro-slug",
      domain: tenant.domain,
      plan: tenant.plan,
      requestedModules: tenant.requestedModules,
      branding: tenant.branding,
    });
    const errors = validateTenantManifestCompatibility(tenant, manifest);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("incompatibilidade tenant×manifesto");
  });
});

describe("validateTenantReadinessForProvisioning", () => {
  it("tenant recém-criado (draft) tem blockers de prontidão", () => {
    const tenant = baseTenant();
    const result = validateTenantReadinessForProvisioning(tenant);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("tenant totalmente pronto não tem blocker de prontidão", () => {
    const tenant = baseTenant({
      commercialStatus: "contracted",
      accountManager: { name: "Gestor", email: "gestor@brighter.invalid" },
      infrastructure: { target: "vercel", projectReference: "prj_123" },
      supabase: { projectRef: "projref", projectUrl: "https://projref.supabase.co" },
    });
    const manifest = manifestFor(tenant);
    const attached = attachDeploymentManifest(tenant, manifest);
    expect(attached.ok).toBe(true);
    if (!attached.ok) return;

    const result = validateTenantReadinessForProvisioning(attached.tenant);
    expect(result.blockers).toEqual([]);
  });
});

describe("detectCircularStepDependencies", () => {
  function fakeStep(id: string, dependsOn: string[]): ProvisioningStepDefinition {
    return {
      id,
      name: id,
      description: "",
      category: "validation",
      appliesToPlans: ["lite", "pro", "dedicated"],
      dependsOn,
      required: true,
      supportsRollback: false,
      idempotencyKey: `step.${id}`,
    };
  }

  it("acha ciclo direto (a -> b -> a) num catálogo minúsculo malformado", () => {
    const catalog = [fakeStep("a", ["b"]), fakeStep("b", ["a"])];
    const cycle = detectCircularStepDependencies(catalog);
    expect(cycle).not.toBeNull();
    expect(cycle).toContain("a");
    expect(cycle).toContain("b");
  });

  it("catálogo sem ciclo devolve null", () => {
    const catalog = [fakeStep("a", []), fakeStep("b", ["a"])];
    expect(detectCircularStepDependencies(catalog)).toBeNull();
  });
});

describe("validateStepCatalog", () => {
  it("acha dependsOn órfão (aponta pra id inexistente)", () => {
    const catalog: ProvisioningStepDefinition[] = [
      {
        id: "a",
        name: "A",
        description: "",
        category: "validation",
        appliesToPlans: ["lite"],
        dependsOn: ["nao_existe"],
        required: true,
        supportsRollback: false,
        idempotencyKey: "step.a",
      },
    ];
    const errors = validateStepCatalog(catalog);
    expect(errors.some((e) => e.includes("nao_existe"))).toBe(true);
  });

  it("acha id duplicado", () => {
    const dup: ProvisioningStepDefinition = {
      id: "a",
      name: "A",
      description: "",
      category: "validation",
      appliesToPlans: ["lite"],
      required: true,
      supportsRollback: false,
      idempotencyKey: "step.a",
    };
    const errors = validateStepCatalog([dup, dup]);
    expect(errors.some((e) => e.includes("duplicada"))).toBe(true);
  });
});
