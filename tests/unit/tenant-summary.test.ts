import { describe, expect, it } from "vitest";

import { generateDeploymentManifest } from "@/lib/deployment";
import { evaluateTenantReadiness } from "@/lib/tenants/readiness";
import { summarizeTenantCommercial, summarizeTenantTechnical } from "@/lib/tenants/summary";
import type { Tenant } from "@/lib/tenants/types";

function tenantWithManifest(): Tenant {
  const now = new Date().toISOString();
  const branding = { appName: "Empresa Exemplo", supportEmail: "suporte@empresa-exemplo.invalid" };
  const manifest = generateDeploymentManifest({
    clientName: "Empresa Exemplo",
    clientSlug: "empresa-exemplo",
    domain: "crm.empresa.com.br",
    plan: "pro",
    requestedModules: ["core.contacts", "core.pipeline"],
    branding,
  });

  return {
    id: "11111111-1111-4111-8111-111111111111",
    clientName: "Empresa Exemplo",
    clientSlug: "empresa-exemplo",
    domain: "crm.empresa.com.br",
    plan: "pro",
    requestedModules: ["core.contacts", "core.pipeline"],
    enabledModules: manifest.enabledModules,
    branding,
    commercialStatus: "active",
    technicalStatus: "live",
    primaryContact: { name: "Fulano", email: "fulano@empresa.invalid" },
    accountManager: { name: "Ciclana", email: "ciclana@brighter.invalid" },
    infrastructure: { target: "vercel", projectReference: "prj_123" },
    supabase: { projectRef: "abcxyz", projectUrl: "https://abcxyz.supabase.co" },
    manifest,
    notes: "Cliente prioritário",
    createdAt: now,
    updatedAt: now,
  };
}

describe("summarizeTenantTechnical", () => {
  it("reflete o tenant e a readiness recebidos, sem recalcular nada", () => {
    const tenant = tenantWithManifest();
    const readiness = evaluateTenantReadiness(tenant);

    const summary = summarizeTenantTechnical(tenant, readiness);

    expect(summary.plan).toBe("pro");
    expect(summary.domain).toBe(tenant.domain);
    expect(summary.enabledModules).toEqual(tenant.enabledModules);
    expect(summary.infrastructureReference).toEqual(tenant.infrastructure);
    expect(summary.supabase).toEqual(tenant.supabase);
    expect(summary.manifestValid).toBe(tenant.manifest?.valid);
    expect(summary.readinessScore).toBe(readiness.score);
    expect(summary.technicalStatus).toBe("live");
  });
});

describe("summarizeTenantCommercial", () => {
  it("reflete o tenant e a readiness recebidos, sem recalcular nada", () => {
    const tenant = tenantWithManifest();
    const readiness = evaluateTenantReadiness(tenant);

    const summary = summarizeTenantCommercial(tenant, readiness);

    expect(summary.clientName).toBe(tenant.clientName);
    expect(summary.clientSlug).toBe(tenant.clientSlug);
    expect(summary.commercialStatus).toBe("active");
    expect(summary.primaryContact).toEqual(tenant.primaryContact);
    expect(summary.accountManager).toEqual(tenant.accountManager);
    expect(summary.notes).toBe("Cliente prioritário");
    expect(summary.readinessScore).toBe(readiness.score);
  });

  it("primaryContact/accountManager/notes ausentes viram null, não undefined", () => {
    const tenant = tenantWithManifest();
    delete tenant.primaryContact;
    delete tenant.accountManager;
    delete tenant.notes;
    const readiness = evaluateTenantReadiness(tenant);

    const summary = summarizeTenantCommercial(tenant, readiness);

    expect(summary.primaryContact).toBeNull();
    expect(summary.accountManager).toBeNull();
    expect(summary.notes).toBeNull();
  });
});
