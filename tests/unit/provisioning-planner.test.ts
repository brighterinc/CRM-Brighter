import { describe, expect, it } from "vitest";

import { generateDeploymentManifest, type DeploymentPlan } from "@/lib/deployment";
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import type { Tenant } from "@/lib/tenants/types";

import { calculateProvisioningFingerprint, generateProvisioningPlan, PROVISIONING_STEP_CATALOG } from "@/lib/provisioning";

const SENSITIVE_PATTERN = /password|token|api[_-]?key|secret|service[_-]?role|database[_-]?url|connection[_-]?string|ssh[_-]?key|private[_-]?key/i;

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

function readyTenantAndManifest(plan: DeploymentPlan) {
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
  return { tenant: attached.tenant, manifest };
}

function stepIds(plan: ReturnType<typeof generateProvisioningPlan>): string[] {
  return plan.steps.map((s) => s.stepId);
}

describe("generateProvisioningPlan — planos saudáveis", () => {
  it("Lite: contém etapas de frontend gerenciado, não contém VPS", () => {
    const { tenant, manifest } = readyTenantAndManifest("lite");
    const plan = generateProvisioningPlan({ tenant, manifest });

    expect(plan.blockers).toEqual([]);
    expect(plan.status).toBe("ready");
    expect(stepIds(plan)).toEqual(
      expect.arrayContaining(["create_supabase_project", "create_frontend_project", "deploy_frontend", "create_owner"]),
    );
    expect(stepIds(plan)).not.toEqual(expect.arrayContaining(["prepare_vps", "install_runtime"]));
  });

  it("Pro: mesma forma do Lite (frontend gerenciado, sem VPS)", () => {
    const { tenant, manifest } = readyTenantAndManifest("pro");
    const plan = generateProvisioningPlan({ tenant, manifest });

    expect(plan.blockers).toEqual([]);
    expect(plan.status).toBe("ready");
    expect(stepIds(plan)).toEqual(expect.arrayContaining(["create_frontend_project", "deploy_frontend"]));
    expect(stepIds(plan)).not.toEqual(expect.arrayContaining(["prepare_vps"]));
  });

  it("Dedicated: contém VPS/proxy/Redis/worker/scheduler/WhatsApp, não contém frontend gerenciado", () => {
    const { tenant, manifest } = readyTenantAndManifest("dedicated");
    const plan = generateProvisioningPlan({ tenant, manifest });

    expect(plan.blockers).toEqual([]);
    expect(plan.status).toBe("ready");
    expect(stepIds(plan)).toEqual(
      expect.arrayContaining([
        "prepare_vps",
        "install_runtime",
        "configure_reverse_proxy",
        "configure_redis",
        "configure_worker",
        "configure_scheduler",
        "configure_backup",
        "configure_monitoring",
        "configure_whatsapp",
      ]),
    );
    expect(stepIds(plan)).not.toEqual(expect.arrayContaining(["create_frontend_project", "deploy_frontend"]));
  });

  it("ordem respeita dependsOn — cada etapa vem depois de todas as suas dependências (dentro do plano)", () => {
    const { tenant, manifest } = readyTenantAndManifest("dedicated");
    const plan = generateProvisioningPlan({ tenant, manifest });
    const indexOf = new Map(plan.steps.map((s, i) => [s.stepId, i]));
    const byId = new Map(PROVISIONING_STEP_CATALOG.map((s) => [s.id, s]));

    for (const step of plan.steps) {
      const def = byId.get(step.stepId)!;
      for (const depId of def.dependsOn ?? []) {
        if (!indexOf.has(depId)) continue;
        expect(indexOf.get(step.stepId)!).toBeGreaterThan(indexOf.get(depId)!);
      }
    }
  });

  it("etapas sem dependência dentro do plano nascem 'ready'; com dependência nascem 'pending'", () => {
    const { tenant, manifest } = readyTenantAndManifest("lite");
    const plan = generateProvisioningPlan({ tenant, manifest });
    const first = plan.steps[0]!;
    expect(first.status).toBe("ready");
    const withDeps = plan.steps.find((s) => s.stepId === "configure_ssl")!;
    expect(withDeps.status).toBe("pending");
  });
});

describe("generateProvisioningPlan — inválido", () => {
  it("manifesto inválido (módulo inexistente) bloqueia todas as etapas", () => {
    const tenant = baseTenant("lite", { requestedModules: ["modulo.inexistente"] });
    const manifest = generateDeploymentManifest({
      clientName: tenant.clientName,
      clientSlug: tenant.clientSlug,
      domain: tenant.domain,
      plan: tenant.plan,
      requestedModules: tenant.requestedModules,
      branding: tenant.branding,
    });
    expect(manifest.valid).toBe(false);

    // Sem `attachDeploymentManifest` bem-sucedido (o manifesto é inválido,
    // mas ainda foi gerado pro mesmo tenant) — usamos o tenant original com
    // manifest anexado manualmente pra exercitar o branch "inválido".
    const tenantWithManifest: Tenant = { ...tenant, manifest, enabledModules: manifest.enabledModules };
    const plan = generateProvisioningPlan({ tenant: tenantWithManifest, manifest });

    expect(plan.status).toBe("blocked");
    expect(plan.blockers.length).toBeGreaterThan(0);
    expect(plan.steps.every((s) => s.status === "blocked")).toBe(true);
  });

  it("catálogo com dependência circular vira blocker crítico", () => {
    const { tenant, manifest } = readyTenantAndManifest("lite");
    const circularCatalog = [
      { ...PROVISIONING_STEP_CATALOG[0]!, dependsOn: ["validate_manifest"] },
      ...PROVISIONING_STEP_CATALOG.slice(1),
    ];
    const plan = generateProvisioningPlan({ tenant, manifest, catalog: circularCatalog });
    expect(plan.status).toBe("blocked");
    expect(plan.blockers.some((b) => b.includes("circular"))).toBe(true);
  });
});

describe("calculateProvisioningFingerprint / idempotencyKey", () => {
  it("é determinístico — mesmo input produz o mesmo fingerprint", () => {
    const input = {
      tenantId: "t1",
      tenantSlug: "empresa-exemplo",
      plan: "lite",
      target: "vercel",
      domain: "crm.empresa.com.br",
      enabledModules: ["core.contacts", "core.pipeline"],
      appName: "Empresa Exemplo",
    };
    expect(calculateProvisioningFingerprint(input)).toBe(calculateProvisioningFingerprint(input));
  });

  it("nunca contém padrão de segredo", () => {
    const fingerprint = calculateProvisioningFingerprint({
      tenantId: "t1",
      tenantSlug: "empresa-exemplo",
      plan: "lite",
      target: "vercel",
      domain: "crm.empresa.com.br",
      enabledModules: ["core.contacts"],
      appName: "Empresa Exemplo",
    });
    expect(SENSITIVE_PATTERN.test(fingerprint)).toBe(false);
  });

  it("generateProvisioningPlan chamado duas vezes com o mesmo input gera o mesmo manifestFingerprint", () => {
    const { tenant, manifest } = readyTenantAndManifest("lite");
    const plan1 = generateProvisioningPlan({ tenant, manifest });
    const plan2 = generateProvisioningPlan({ tenant, manifest });
    expect(plan1.manifestFingerprint).toBe(plan2.manifestFingerprint);
  });
});
