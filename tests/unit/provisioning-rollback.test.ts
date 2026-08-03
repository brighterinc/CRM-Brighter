import { describe, expect, it } from "vitest";

import { generateDeploymentManifest } from "@/lib/deployment";
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import type { Tenant } from "@/lib/tenants/types";

import {
  buildRollbackPlan,
  executeProvisioningPlan,
  generateProvisioningPlan,
  getProvisioningStepDefinition,
  NoopProvisioningAdapter,
} from "@/lib/provisioning";

function readyLiteTenantAndManifest() {
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

describe("buildRollbackPlan", () => {
  it("plano recém-gerado (nada completed) não tem rollback disponível", () => {
    const { tenant, manifest } = readyLiteTenantAndManifest();
    const plan = generateProvisioningPlan({ tenant, manifest });
    expect(buildRollbackPlan(plan)).toEqual([]);
  });

  it("lista em ordem inversa só as etapas completed que suportam rollback", async () => {
    const { tenant, manifest } = readyLiteTenantAndManifest();
    const plan = generateProvisioningPlan({ tenant, manifest });
    const { plan: completed } = await executeProvisioningPlan(plan, new NoopProvisioningAdapter());

    const rollback = buildRollbackPlan(completed);
    expect(rollback.length).toBeGreaterThan(0);

    // Toda etapa listada de fato suporta rollback.
    for (const action of rollback) {
      expect(getProvisioningStepDefinition(action.stepId)?.supportsRollback).toBe(true);
    }

    // "validate_tenant" está completed mas supportsRollback: false — nunca aparece.
    expect(rollback.some((a) => a.stepId === "validate_tenant")).toBe(false);

    // Ordem inversa: a última etapa completed do plano aparece primeiro no rollback.
    const lastCompletedWithRollback = [...completed.steps]
      .reverse()
      .find((s) => s.status === "completed" && getProvisioningStepDefinition(s.stepId)?.supportsRollback);
    expect(rollback[0]?.stepId).toBe(lastCompletedWithRollback?.stepId);
  });
});
