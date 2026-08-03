import { describe, expect, it } from "vitest";

import { generateDeploymentManifest } from "@/lib/deployment";
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import { createDemoTenants } from "@/lib/tenants/repository";
import type { Tenant } from "@/lib/tenants/types";

import {
  createDemoInstallations,
  InMemoryInstallationRepository,
  InstallationNotFoundError,
  InstallationValidationFailedError,
  TenantMissingManifestError,
  type InstallationCreateInput,
} from "@/lib/control-plane/repository";

function readyTenant(overrides: Partial<Tenant> = {}): Tenant {
  const now = new Date().toISOString();
  const tenant: Tenant = {
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

function validCreateInput(overrides: Partial<InstallationCreateInput> = {}): InstallationCreateInput {
  return {
    slug: "empresa-exemplo",
    company: "Empresa Exemplo",
    status: "active",
    commercial: "production",
    technical: "running",
    tenant: readyTenant(),
    ...overrides,
  };
}

describe("InMemoryInstallationRepository", () => {
  it("createInstallation() gera id/createdAt/updatedAt e deriva campos do tenant", async () => {
    const repo = new InMemoryInstallationRepository();
    const installation = await repo.createInstallation(validCreateInput());

    expect(installation.id).toBeTruthy();
    expect(installation.createdAt).toBe(installation.updatedAt);
    expect(installation.branding).toBe(installation.tenant.branding);
    expect(installation.deployment).toBe(installation.tenant.manifest);
    expect(installation.modules).toEqual(installation.tenant.enabledModules);
    expect(installation.deploymentPlan).toBe(installation.tenant.plan);
    expect(installation.provisioning.tenantSlug).toBe(installation.tenant.clientSlug);
  });

  it("createInstallation() com tenant sem manifest lança TenantMissingManifestError", async () => {
    const repo = new InMemoryInstallationRepository();
    const now = new Date().toISOString();
    const bareTenant: Tenant = {
      id: "33333333-3333-4333-8333-333333333333",
      clientName: "Sem Manifesto",
      clientSlug: "sem-manifesto",
      domain: "crm.sem-manifesto.com.br",
      plan: "lite",
      requestedModules: [],
      enabledModules: [],
      branding: { appName: "Sem Manifesto" },
      commercialStatus: "lead",
      technicalStatus: "draft",
      createdAt: now,
      updatedAt: now,
    };

    await expect(repo.createInstallation(validCreateInput({ tenant: bareTenant }))).rejects.toBeInstanceOf(
      TenantMissingManifestError,
    );
  });

  it("createInstallation() com slug inválido lança InstallationValidationFailedError", async () => {
    const repo = new InMemoryInstallationRepository();
    await expect(repo.createInstallation(validCreateInput({ slug: "" }))).rejects.toBeInstanceOf(
      InstallationValidationFailedError,
    );
  });

  it("list() devolve todas as instalações criadas", async () => {
    const repo = new InMemoryInstallationRepository();
    await repo.createInstallation(validCreateInput({ slug: "cliente-a", tenant: readyTenant({ clientSlug: "cliente-a" }) }));
    await repo.createInstallation(validCreateInput({ slug: "cliente-b", tenant: readyTenant({ clientSlug: "cliente-b" }) }));

    expect(await repo.list()).toHaveLength(2);
  });

  it("findInstallation() encontra por id e por slug, devolve null quando não existe", async () => {
    const repo = new InMemoryInstallationRepository();
    const installation = await repo.createInstallation(validCreateInput({ slug: "achavel", tenant: readyTenant({ clientSlug: "achavel" }) }));

    expect(await repo.findInstallation(installation.id)).toEqual(installation);
    expect(await repo.findInstallation("achavel")).toEqual(installation);
    expect(await repo.findInstallation("inexistente")).toBeNull();
  });

  it("updateInstallation() aplica patch parcial e revalida", async () => {
    const repo = new InMemoryInstallationRepository();
    const installation = await repo.createInstallation(validCreateInput());

    const updated = await repo.updateInstallation(installation.id, { status: "maintenance" });

    expect(updated.status).toBe("maintenance");
    expect(updated.company).toBe(installation.company);
    expect(updated.createdAt).toBe(installation.createdAt);
  });

  it("updateInstallation() com novo tenant rederiva branding/deployment/modules/provisioning", async () => {
    const repo = new InMemoryInstallationRepository();
    const installation = await repo.createInstallation(validCreateInput());
    const newTenant = readyTenant({ clientSlug: "empresa-exemplo", plan: "pro", requestedModules: ["core.contacts"] });

    const updated = await repo.updateInstallation(installation.id, { tenant: newTenant });

    expect(updated.deploymentPlan).toBe("pro");
    expect(updated.branding).toBe(newTenant.branding);
    expect(updated.deployment).toBe(newTenant.manifest);
  });

  it("updateInstallation() de id inexistente lança InstallationNotFoundError", async () => {
    const repo = new InMemoryInstallationRepository();
    await expect(repo.updateInstallation("does-not-exist", { status: "active" })).rejects.toBeInstanceOf(
      InstallationNotFoundError,
    );
  });

  it("archiveInstallation() marca status archived", async () => {
    const repo = new InMemoryInstallationRepository();
    const installation = await repo.createInstallation(validCreateInput());
    const archived = await repo.archiveInstallation(installation.id);
    expect(archived.status).toBe("archived");
  });

  it("filterInstallations() aplica um predicado arbitrário", async () => {
    const repo = new InMemoryInstallationRepository();
    await repo.createInstallation(validCreateInput({ status: "active" }));
    await repo.createInstallation(validCreateInput({ status: "paused", tenant: readyTenant({ clientSlug: "outra" }) }));

    const activeOnly = await repo.filterInstallations((i) => i.status === "active");
    expect(activeOnly).toHaveLength(1);
  });

  it("countByStatus() agrega corretamente", async () => {
    const repo = new InMemoryInstallationRepository();
    await repo.createInstallation(validCreateInput({ status: "active" }));
    await repo.createInstallation(validCreateInput({ status: "active", tenant: readyTenant({ clientSlug: "outra" }) }));
    await repo.createInstallation(validCreateInput({ status: "paused", tenant: readyTenant({ clientSlug: "terceira" }) }));

    const counts = await repo.countByStatus();
    expect(counts.active).toBe(2);
    expect(counts.paused).toBe(1);
  });

  it("aceita seed inicial no construtor", async () => {
    const repo = new InMemoryInstallationRepository(createDemoInstallations());
    expect((await repo.list()).length).toBeGreaterThanOrEqual(3);
  });
});

describe("createDemoInstallations", () => {
  it("cobre os três planos (Lite/Pro/Dedicated)", () => {
    const demo = createDemoInstallations();
    const plans = new Set(demo.map((i) => i.deploymentPlan));
    expect(plans).toEqual(new Set(["lite", "pro", "dedicated"]));
  });

  it("cada instalação deriva branding/deployment/modules do próprio tenant", () => {
    for (const installation of createDemoInstallations()) {
      expect(installation.branding).toBe(installation.tenant.branding);
      expect(installation.deployment).toBe(installation.tenant.manifest);
      expect(installation.modules).toEqual(installation.tenant.enabledModules);
    }
  });

  it("espelha o mesmo número de tenants de demonstração do Tenant Engine", () => {
    expect(createDemoInstallations()).toHaveLength(createDemoTenants().length);
  });
});
