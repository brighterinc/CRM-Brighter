import { describe, expect, it } from "vitest";

import { generateDeploymentManifest } from "@/lib/deployment";
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import type { Tenant } from "@/lib/tenants/types";

import { validateInstallationInput } from "@/lib/control-plane/validation";
import { generateProvisioningPlan, generateProvisioningSummary } from "@/lib/provisioning";
import type { Installation } from "@/lib/control-plane/types";

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
    commercialStatus: "contracted",
    technicalStatus: "ready_to_provision",
    accountManager: { name: "Gestor", email: "gestor@brighter.invalid" },
    infrastructure: { target: "vercel", projectReference: "prj_123" },
    supabase: { projectRef: "projref", projectUrl: "https://projref.supabase.co" },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function readyTenant(): Tenant {
  const tenant = baseTenant();
  const manifest = generateDeploymentManifest({
    clientName: tenant.clientName,
    clientSlug: tenant.clientSlug,
    domain: tenant.domain,
    plan: tenant.plan,
    requestedModules: tenant.requestedModules,
    branding: tenant.branding,
  });
  const attached = attachDeploymentManifest(tenant, manifest);
  if (!attached.ok) throw new Error(`fixture inválida: ${JSON.stringify(attached.errors)}`);
  return attached.tenant;
}

function validInstallation(overrides: Partial<Installation> = {}): Installation {
  const tenant = readyTenant();
  const plan = generateProvisioningPlan({ tenant, manifest: tenant.manifest! });
  const provisioning = generateProvisioningSummary(plan, tenant.manifest!);
  const now = new Date().toISOString();

  return {
    id: "22222222-2222-4222-8222-222222222222",
    slug: tenant.clientSlug,
    company: tenant.clientName,
    status: "active",
    commercial: "production",
    technical: "running",
    deploymentPlan: tenant.plan,
    tenant,
    branding: tenant.branding,
    modules: tenant.enabledModules,
    deployment: tenant.manifest!,
    provisioning,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("validateInstallationInput", () => {
  it("instalação bem formada não gera erro", () => {
    expect(validateInstallationInput(validInstallation())).toEqual([]);
  });

  it("id inválido gera erro em 'id'", () => {
    const errors = validateInstallationInput(validInstallation({ id: "not-a-uuid" }));
    expect(errors.some((e) => e.field === "id")).toBe(true);
  });

  it("slug vazio gera erro em 'slug'", () => {
    const errors = validateInstallationInput(validInstallation({ slug: "" }));
    expect(errors.some((e) => e.field === "slug")).toBe(true);
  });

  it("status inválido gera erro em 'status'", () => {
    // @ts-expect-error — testando runtime guard contra valor fora do vocabulário
    const errors = validateInstallationInput(validInstallation({ status: "bogus" }));
    expect(errors.some((e) => e.field === "status")).toBe(true);
  });

  it("commercial inválido gera erro em 'commercial'", () => {
    // @ts-expect-error — testando runtime guard
    const errors = validateInstallationInput(validInstallation({ commercial: "bogus" }));
    expect(errors.some((e) => e.field === "commercial")).toBe(true);
  });

  it("technical inválido gera erro em 'technical'", () => {
    // @ts-expect-error — testando runtime guard
    const errors = validateInstallationInput(validInstallation({ technical: "bogus" }));
    expect(errors.some((e) => e.field === "technical")).toBe(true);
  });

  it("tenant ausente gera erro em 'tenant'", () => {
    const errors = validateInstallationInput(validInstallation({ tenant: undefined }));
    expect(errors.some((e) => e.field === "tenant")).toBe(true);
  });

  it("tenant inválido propaga erro prefixado com 'tenant.'", () => {
    const tenant = readyTenant();
    const errors = validateInstallationInput(validInstallation({ tenant: { ...tenant, clientName: "" } }));
    expect(errors.some((e) => e.field === "tenant.clientName")).toBe(true);
  });

  it("deployment divergente de tenant.manifest gera erro em 'deployment'", () => {
    const tenant = readyTenant();
    const otherManifest = generateDeploymentManifest({
      clientName: "Outro",
      clientSlug: "outro",
      domain: "crm.outro.com.br",
      plan: "pro",
      requestedModules: [],
      branding: { appName: "Outro" },
    });
    const errors = validateInstallationInput(validInstallation({ tenant, deployment: otherManifest }));
    expect(errors.some((e) => e.field === "deployment")).toBe(true);
  });

  it("deployment ausente com tenant.manifest presente gera erro em 'deployment'", () => {
    const tenant = readyTenant();
    const errors = validateInstallationInput(validInstallation({ tenant, deployment: undefined }));
    expect(errors.some((e) => e.field === "deployment")).toBe(true);
  });

  it("branding divergente de tenant.branding gera erro em 'branding'", () => {
    const tenant = readyTenant();
    const errors = validateInstallationInput(
      validInstallation({ tenant, branding: { appName: "Outro Nome" } }),
    );
    expect(errors.some((e) => e.field === "branding")).toBe(true);
  });

  it("modules divergente de tenant.enabledModules gera erro em 'modules'", () => {
    const tenant = readyTenant();
    const errors = validateInstallationInput(validInstallation({ tenant, modules: ["core.contacts", "core.pipeline", "extra.desconhecido"] }));
    expect(errors.some((e) => e.field === "modules")).toBe(true);
  });

  it("modules com id desconhecido no catálogo gera erro em 'modules'", () => {
    const tenant = readyTenant();
    const errors = validateInstallationInput(
      validInstallation({ tenant, modules: [...tenant.enabledModules, "modulo.inventado"] }),
    );
    expect(errors.some((e) => e.field === "modules" && e.message.includes("desconhecido"))).toBe(true);
  });

  it("deploymentPlan divergente de tenant.plan gera erro em 'deploymentPlan'", () => {
    const tenant = readyTenant();
    const errors = validateInstallationInput(validInstallation({ tenant, deploymentPlan: "dedicated" }));
    expect(errors.some((e) => e.field === "deploymentPlan")).toBe(true);
  });

  it("provisioning ausente gera erro em 'provisioning'", () => {
    const errors = validateInstallationInput(validInstallation({ provisioning: undefined }));
    expect(errors.some((e) => e.field === "provisioning")).toBe(true);
  });

  it("createdAt/updatedAt malformados geram erro", () => {
    const errors = validateInstallationInput(validInstallation({ createdAt: "not-a-date", updatedAt: "" }));
    expect(errors.some((e) => e.field === "createdAt")).toBe(true);
    expect(errors.some((e) => e.field === "updatedAt")).toBe(true);
  });

  it("tenant sem manifest gera erro em 'tenant.manifest'", () => {
    const tenant = baseTenant();
    const errors = validateInstallationInput(validInstallation({ tenant }));
    expect(errors.some((e) => e.field === "tenant.manifest")).toBe(true);
  });
});
