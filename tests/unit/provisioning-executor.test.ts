import { describe, expect, it } from "vitest";

import { generateDeploymentManifest, type DeploymentPlan } from "@/lib/deployment";
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import type { Tenant } from "@/lib/tenants/types";

import {
  executeProvisioningPlan,
  generateProvisioningPlan,
  InMemoryProvisioningAdapter,
  NoopProvisioningAdapter,
  simulateProvisioning,
} from "@/lib/provisioning";

function baseTenant(plan: DeploymentPlan, overrides: Partial<Tenant> = {}): Tenant {
  const now = new Date().toISOString();
  const requestedModules =
    plan === "dedicated" ? ["core.contacts", "core.pipeline", "channel.whatsapp"] : ["core.contacts", "core.pipeline"];
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
    infrastructure:
      plan === "dedicated"
        ? { target: "vps", provider: "hostgator", externalId: "vps-001" }
        : { target: "vercel", projectReference: "prj_123" },
    supabase: { projectRef: "projref", projectUrl: "https://projref.supabase.co" },
    createdAt: now,
    updatedAt: now,
    ...overrides,
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

function blockedPlan() {
  const tenant = baseTenant("lite", { commercialStatus: "lead", accountManager: undefined, infrastructure: undefined });
  const manifest = generateDeploymentManifest({
    clientName: tenant.clientName,
    clientSlug: tenant.clientSlug,
    domain: tenant.domain,
    plan: tenant.plan,
    requestedModules: tenant.requestedModules,
    branding: tenant.branding,
  });
  const tenantWithManifest: Tenant = { ...tenant, manifest, enabledModules: manifest.enabledModules };
  return generateProvisioningPlan({ tenant: tenantWithManifest, manifest });
}

describe("executeProvisioningPlan — NoopProvisioningAdapter", () => {
  it("completa o run sem tocar rede", async () => {
    const plan = readyPlan("lite");
    const { plan: result, logs } = await executeProvisioningPlan(plan, new NoopProvisioningAdapter());

    expect(result.status).toBe("completed");
    expect(result.steps.every((s) => s.status === "completed")).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.event.startsWith("noop."))).toBe(true);
  });

  it("nunca executa etapa de um run bloqueado", async () => {
    const plan = blockedPlan();
    const { plan: result, logs } = await executeProvisioningPlan(plan, new NoopProvisioningAdapter());

    expect(result.status).toBe("blocked");
    expect(result.steps.every((s) => s.status === "blocked")).toBe(true);
    expect(logs).toEqual([]);
  });

  it("não reexecuta etapa já completed (idempotência) — attempts não muda na segunda chamada", async () => {
    const plan = readyPlan("lite");
    const adapter = new NoopProvisioningAdapter();
    const first = await executeProvisioningPlan(plan, adapter);
    expect(first.plan.steps.every((s) => s.attempts === 1)).toBe(true);

    const second = await executeProvisioningPlan(first.plan, adapter);
    expect(second.logs).toEqual([]);
    expect(second.plan.steps.every((s) => s.attempts === 1)).toBe(true);
  });
});

describe("executeProvisioningPlan — InMemoryProvisioningAdapter (falha)", () => {
  it("falha em etapa required para o run e não executa as etapas seguintes", async () => {
    const plan = readyPlan("lite");
    const adapter = new InMemoryProvisioningAdapter({ failSteps: new Set(["create_supabase_project"]) });
    const { plan: result } = await executeProvisioningPlan(plan, adapter);

    expect(result.status).toBe("failed");
    const supabaseStep = result.steps.find((s) => s.stepId === "create_supabase_project")!;
    expect(supabaseStep.status).toBe("failed");
    const frontendStep = result.steps.find((s) => s.stepId === "create_frontend_project")!;
    expect(frontendStep.status).not.toBe("completed");
    expect(frontendStep.attempts).toBe(0);
  });
});

describe("simulateProvisioning — cenários determinísticos", () => {
  it("Lite saudável", async () => {
    const { plan } = await simulateProvisioning(readyPlan("lite"));
    expect(plan.status).toBe("completed");
  });

  it("Pro saudável", async () => {
    const { plan } = await simulateProvisioning(readyPlan("pro"));
    expect(plan.status).toBe("completed");
  });

  it("Dedicated saudável", async () => {
    const { plan } = await simulateProvisioning(readyPlan("dedicated"));
    expect(plan.status).toBe("completed");
  });

  it("falha em domínio", async () => {
    const { plan } = await simulateProvisioning(readyPlan("lite"), { failStepIds: ["configure_domain"] });
    expect(plan.status).toBe("failed");
    const ssl = plan.steps.find((s) => s.stepId === "configure_ssl")!;
    expect(ssl.status).not.toBe("completed");
  });

  it("falha em Supabase", async () => {
    const { plan } = await simulateProvisioning(readyPlan("lite"), { failStepIds: ["create_supabase_project"] });
    expect(plan.status).toBe("failed");
  });

  it("falha em VPS", async () => {
    const { plan } = await simulateProvisioning(readyPlan("dedicated"), { failStepIds: ["prepare_vps"] });
    expect(plan.status).toBe("failed");
    const runtime = plan.steps.find((s) => s.stepId === "install_runtime")!;
    expect(runtime.status).not.toBe("completed");
  });

  it("dependência bloqueada (tenant sem prontidão) nunca simula nada", async () => {
    const { plan, logs } = await simulateProvisioning(blockedPlan());
    expect(plan.status).toBe("blocked");
    expect(logs).toEqual([]);
  });
});
