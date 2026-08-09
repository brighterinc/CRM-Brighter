import { describe, expect, it } from "vitest";

import { generateDeploymentManifest, type DeploymentPlan } from "@/lib/deployment";
import { generateProvisioningPlan } from "@/lib/provisioning";
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import type { Tenant } from "@/lib/tenants/types";

import {
  attachAdaptersToProvisioningPlan,
  attachMarketplaceActivationToAdapters,
  attachProvisioningAdapterSummaryToInstallationSummary,
  createDefaultProvisioningAdapterRegistry,
  executeProvisioningDryRun,
  generateProvisioningAdapterSummary,
  generateProvisioningRollbackPreview,
} from "@/lib/provisioning-adapters";

function baseTenant(plan: DeploymentPlan): Tenant {
  const now = new Date().toISOString();
  const requestedModules = plan === "dedicated" ? ["core.contacts", "core.pipeline", "channel.whatsapp"] : ["core.contacts", "core.pipeline"];
  return {
    id: "11111111-1111-4111-8111-111111111111",
    clientName: "Empresa Exemplo",
    clientSlug: "empresa-exemplo",
    domain: "crm.empresa.com.br",
    plan,
    requestedModules,
    enabledModules: [],
    branding: { appName: "Empresa Exemplo", supportEmail: "suporte@empresa-exemplo.com.br" },
    commercialStatus: "contracted",
    technicalStatus: "ready_to_provision",
    accountManager: { name: "Gestor", email: "gestor@brighter.invalid" },
    infrastructure: plan === "dedicated" ? { target: "vps", provider: "hostgator", externalId: "vps-001" } : { target: "vercel", projectReference: "prj_123" },
    supabase: { projectRef: "projref", projectUrl: "https://projref.supabase.co" },
    createdAt: now,
    updatedAt: now,
  };
}

function readyPlan(plan: DeploymentPlan) {
  const tenant = baseTenant(plan);
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
  return generateProvisioningPlan({ tenant: attached.tenant, manifest });
}

describe("attachAdaptersToProvisioningPlan", () => {
  it("view model de cobertura — nunca escreve no ProvisioningPlan", () => {
    const plan = readyPlan("dedicated");
    const registry = createDefaultProvisioningAdapterRegistry();
    const before = JSON.stringify(plan);

    const attachment = attachAdaptersToProvisioningPlan(plan, registry);

    expect(JSON.stringify(plan)).toBe(before);
    expect(attachment.provisioningPlanId).toBe(plan.id);
    expect(attachment.steps).toHaveLength(plan.steps.length);
    expect(attachment.mappedCount + attachment.unmappedCount + attachment.missingAdapterCount + attachment.missingCapabilityCount).toBe(plan.steps.length);
  });

  it("reporta missing_adapter quando o registry não tem o provider", () => {
    const plan = readyPlan("dedicated");
    const registry = createDefaultProvisioningAdapterRegistry();
    registry.unregisterAdapter("redis");

    const attachment = attachAdaptersToProvisioningPlan(plan, registry);
    const redisStep = attachment.steps.find((s) => s.stepId === "configure_redis");
    expect(redisStep?.adapterStatus).toBe("missing_adapter");
    expect(attachment.missingAdapterCount).toBeGreaterThan(0);
  });
});

describe("attachMarketplaceActivationToAdapters", () => {
  it("deriva providers a partir de ModuleDefinition.requires — nunca de texto livre", () => {
    const view = attachMarketplaceActivationToAdapters([{ moduleId: "channel.whatsapp", desiredState: "activated", blockers: [] }]);
    expect(view.activationPlanCount).toBe(1);
    expect(view.providersInvolved).toContain("whatsapp");
    expect(view.touchpoints.every((t) => t.moduleId === "channel.whatsapp")).toBe(true);
  });

  it("ignora plano de ativação com blocker ou desiredState=deactivated", () => {
    const view = attachMarketplaceActivationToAdapters([
      { moduleId: "channel.whatsapp", desiredState: "activated", blockers: ["algum bloqueio"] },
      { moduleId: "channel.whatsapp", desiredState: "deactivated", blockers: [] },
    ]);
    expect(view.activationPlanCount).toBe(0);
    expect(view.touchpoints).toEqual([]);
  });

  it("módulo desconhecido não quebra, só não gera touchpoint", () => {
    const view = attachMarketplaceActivationToAdapters([{ moduleId: "modulo.inexistente", desiredState: "activated", blockers: [] }]);
    expect(view.touchpoints).toEqual([]);
  });
});

describe("attachProvisioningAdapterSummaryToInstallationSummary", () => {
  it("sem summary prévio — readiness blocked, recomenda rodar CLI", () => {
    const registry = createDefaultProvisioningAdapterRegistry();
    const overview = attachProvisioningAdapterSummaryToInstallationSummary({ id: "i1", slug: "empresa", company: "Empresa" }, null, registry);
    expect(overview.readiness).toBe("blocked");
    expect(overview.recommendedNextAction).toMatch(/pnpm provisioning:adapters/);
  });

  it("com summary saudável — readiness ready, rollbackReady coerente", async () => {
    const plan = readyPlan("dedicated");
    const registry = createDefaultProvisioningAdapterRegistry();
    const { outcomes } = await executeProvisioningDryRun(plan, { installationId: "i1", tenantId: plan.tenantId, registry });
    const rollbackPreview = generateProvisioningRollbackPreview(outcomes);
    const summary = generateProvisioningAdapterSummary({ scenario: "teste", installation: { id: "i1", slug: "empresa", company: "Empresa" } as never, plan, outcomes, rollbackPreview, blockers: [], warnings: [] });

    const overview = attachProvisioningAdapterSummaryToInstallationSummary({ id: "i1", slug: "empresa", company: "Empresa" }, summary, registry);
    expect(overview.readiness).toBe("ready");
    expect(overview.rollbackReady).toBe(rollbackPreview.some((r) => r.reversible));
    expect(overview.providersMissing).toEqual([]);
  });
});
