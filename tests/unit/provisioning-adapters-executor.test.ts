import { describe, expect, it } from "vitest";

import { generateDeploymentManifest, type DeploymentPlan } from "@/lib/deployment";
import { generateProvisioningPlan } from "@/lib/provisioning";
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import type { Tenant } from "@/lib/tenants/types";

import { createDefaultProvisioningAdapterRegistry, executeProvisioningDryRun, InMemoryProvisioningAdapterRepository } from "@/lib/provisioning-adapters";

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

describe("executeProvisioningDryRun", () => {
  it("plano sem blockers — todas as etapas mapeadas ficam prontas", async () => {
    const plan = readyPlan("dedicated");
    const registry = createDefaultProvisioningAdapterRegistry();
    const { outcomes } = await executeProvisioningDryRun(plan, { installationId: "inst-1", tenantId: plan.tenantId, registry });

    const mapped = outcomes.filter((o) => o.mapping.status === "resolved");
    expect(mapped.length).toBeGreaterThan(0);
    for (const o of mapped) expect(o.result?.status).toBe("ready");
  });

  it("plano com blockers globais — nenhuma etapa roda", async () => {
    const plan = readyPlan("dedicated");
    plan.blockers = ["bloqueio de teste"];
    const registry = createDefaultProvisioningAdapterRegistry();
    const { outcomes } = await executeProvisioningDryRun(plan, { installationId: "inst-1", tenantId: plan.tenantId, registry });
    expect(outcomes).toEqual([]);
  });

  it("adapter ausente propaga bloqueio pros dependentes (cascata)", async () => {
    const plan = readyPlan("dedicated");
    const registry = createDefaultProvisioningAdapterRegistry();
    registry.unregisterAdapter("supabase");
    const { outcomes } = await executeProvisioningDryRun(plan, { installationId: "inst-1", tenantId: plan.tenantId, registry });

    const supabaseOutcome = outcomes.find((o) => o.stepId === "create_supabase_project");
    expect(supabaseOutcome?.mapping.status).toBe("missing_adapter");

    // "configure_supabase_auth" também resolve pro provider "supabase" — falha
    // por conta própria (missing_adapter), não por propagação de dependência.
    // "prepare_vps" é o exemplo real de PROPAGAÇÃO: seu próprio provider (vps)
    // está registrado, mas sua dependência "configure_database_policies"
    // (supabase) está ausente.
    const prepareVps = outcomes.find((o) => o.stepId === "prepare_vps");
    expect(prepareVps?.mapping.status).toBe("resolved");
    expect(prepareVps?.result?.status).toBe("blocked");
  });

  it("etapa unmapped nunca bloqueia dependentes", async () => {
    const plan = readyPlan("dedicated");
    const registry = createDefaultProvisioningAdapterRegistry();
    const { outcomes } = await executeProvisioningDryRun(plan, { installationId: "inst-1", tenantId: plan.tenantId, registry });

    const validateTenant = outcomes.find((o) => o.stepId === "validate_tenant");
    expect(validateTenant?.mapping.status).toBe("unmapped");
    // configure_application depende de prepare_environment_template, que por sua vez depende de
    // etapas unmapped — nenhuma delas deveria propagar bloqueio.
    const createSupabase = outcomes.find((o) => o.stepId === "create_supabase_project");
    expect(createSupabase?.result?.status).toBe("ready");
  });

  it("idempotência — mesmo repositório reusa o mesmo requestId na 2ª rodada", async () => {
    const plan = readyPlan("pro");
    const registry = createDefaultProvisioningAdapterRegistry();
    const repository = new InMemoryProvisioningAdapterRepository();

    const first = await executeProvisioningDryRun(plan, { installationId: "inst-1", tenantId: plan.tenantId, registry, repository });
    const second = await executeProvisioningDryRun(plan, { installationId: "inst-1", tenantId: plan.tenantId, registry, repository });

    const firstIds = first.outcomes.filter((o) => o.result).map((o) => o.result!.requestId);
    const secondIds = second.outcomes.filter((o) => o.result).map((o) => o.result!.requestId);
    expect(secondIds).toEqual(firstIds);
  });
});
