import { describe, expect, it } from "vitest";

import { generateDeploymentManifest, type DeploymentPlan } from "@/lib/deployment";
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import type { Tenant } from "@/lib/tenants/types";

import {
  generateProvisioningPlan,
  generateProvisioningSummary,
  renderProvisioningSummaryMarkdown,
} from "@/lib/provisioning";

function readyTenantAndManifest(plan: DeploymentPlan) {
  const now = new Date().toISOString();
  const tenant: Tenant = {
    id: "11111111-1111-4111-8111-111111111111",
    clientName: "Empresa Exemplo",
    clientSlug: "empresa-exemplo",
    domain: "crm.empresa.com.br",
    plan,
    requestedModules: ["core.contacts", "core.pipeline"],
    enabledModules: [],
    branding: { appName: "Empresa Exemplo", supportEmail: "suporte@empresa-exemplo.com.br" },
    commercialStatus: "contracted",
    technicalStatus: "ready_to_provision",
    accountManager: { name: "Gestor", email: "gestor@brighter.invalid" },
    infrastructure:
      plan === "dedicated"
        ? { target: "vps", provider: "hostgator", externalId: "vps-001" }
        : { target: "vercel", projectReference: "prj_123" },
    supabase: { projectRef: "projref", projectUrl: "https://projref.supabase.co" },
    createdAt: now,
    updatedAt: now,
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
  return { tenant: attached.tenant, manifest };
}

describe("generateProvisioningSummary", () => {
  it("inclui variáveis pendentes só quando o manifesto é passado", () => {
    const { tenant, manifest } = readyTenantAndManifest("lite");
    const plan = generateProvisioningPlan({ tenant, manifest });

    const withManifest = generateProvisioningSummary(plan, manifest);
    expect(withManifest.pendingEnvironmentVariables).not.toBeNull();
    expect(withManifest.pendingEnvironmentVariables!.required.length).toBeGreaterThan(0);

    const withoutManifest = generateProvisioningSummary(plan);
    expect(withoutManifest.pendingEnvironmentVariables).toBeNull();
  });

  it("rollbackAvailable é 0 pra um plano recém-gerado", () => {
    const { tenant, manifest } = readyTenantAndManifest("lite");
    const plan = generateProvisioningPlan({ tenant, manifest });
    expect(generateProvisioningSummary(plan).rollbackAvailable).toBe(0);
  });

  it("estimatedEffort nunca contém minutos inventados", () => {
    for (const p of ["lite", "pro", "dedicated"] as const) {
      const { tenant, manifest } = readyTenantAndManifest(p);
      const plan = generateProvisioningPlan({ tenant, manifest });
      const summary = generateProvisioningSummary(plan, manifest);
      expect(summary.estimatedEffort).not.toMatch(/\d+\s*(min|minuto|hora|hour)/i);
    }
  });

  it("recommendedNextStep aponta o primeiro bloqueio quando o plano está bloqueado", () => {
    const tenant: Tenant = {
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const manifest = generateDeploymentManifest({
      clientName: tenant.clientName,
      clientSlug: tenant.clientSlug,
      domain: tenant.domain,
      plan: tenant.plan,
      requestedModules: tenant.requestedModules,
      branding: tenant.branding,
    });
    const tenantWithManifest: Tenant = { ...tenant, manifest, enabledModules: manifest.enabledModules };
    const plan = generateProvisioningPlan({ tenant: tenantWithManifest, manifest });
    const summary = generateProvisioningSummary(plan, manifest);
    expect(summary.recommendedNextStep).toMatch(/^Resolver bloqueio:/);
  });

  it("recommendedNextStep sugere a próxima etapa pronta quando o plano está saudável", () => {
    const { tenant, manifest } = readyTenantAndManifest("lite");
    const plan = generateProvisioningPlan({ tenant, manifest });
    const summary = generateProvisioningSummary(plan, manifest);
    expect(summary.recommendedNextStep).toMatch(/^Executar etapa:/);
  });
});

describe("renderProvisioningSummaryMarkdown", () => {
  it("gera Markdown com as seções esperadas", () => {
    const { tenant, manifest } = readyTenantAndManifest("lite");
    const plan = generateProvisioningPlan({ tenant, manifest });
    const summary = generateProvisioningSummary(plan, manifest);
    const markdown = renderProvisioningSummaryMarkdown(summary);

    expect(markdown).toContain("# Plano de provisionamento");
    expect(markdown).toContain("## Etapas");
    expect(markdown).toContain(summary.fingerprint);
  });
});
