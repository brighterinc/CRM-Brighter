import { describe, expect, it } from "vitest";

import { generateDeploymentManifest } from "@/lib/deployment";
import { InMemoryInstallationRepository } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";
import { MODULE_CATALOG } from "@/lib/modules/catalog";
import type { Tenant } from "@/lib/tenants/types";
import { attachDeploymentManifest } from "@/lib/tenants/validation";

import { AUTOMATION_SIMULATION_SCENARIOS, simulateWorkflowRun } from "@/lib/automation-engine/simulation";

/**
 * Quase todo módulo do catálogo nasce `defaultEnabled: true`
 * (`lib/modules/catalog.ts`) — omitir um módulo de `requestedModules` NÃO
 * o desliga (`resolveModuleAvailability`: `enabledSet.has(id) ||
 * mod.defaultEnabled`). Pra controle exato nesta fixture, desliga
 * explicitamente todo módulo do catálogo que não está na lista desejada.
 */
async function buildInstallation(modules: string[]): Promise<Installation> {
  const disabledModules = MODULE_CATALOG.map((m) => m.id).filter((id) => !modules.includes(id));
  const request = {
    clientName: "Empresa Exemplo",
    clientSlug: "empresa-exemplo",
    domain: "crm.empresa.com.br",
    plan: "dedicated" as const,
    requestedModules: modules,
    disabledModules,
    branding: { appName: "Empresa Exemplo", supportEmail: "suporte@empresa-exemplo.com.br" },
  };
  const manifest = generateDeploymentManifest(request);
  const now = new Date().toISOString();
  const tenant: Tenant = {
    id: "11111111-1111-4111-8111-111111111111",
    clientName: request.clientName,
    clientSlug: request.clientSlug,
    domain: request.domain,
    plan: request.plan,
    requestedModules: modules,
    enabledModules: manifest.enabledModules,
    branding: request.branding,
    commercialStatus: "active",
    technicalStatus: "live",
    createdAt: now,
    updatedAt: now,
  };
  const attached = attachDeploymentManifest(tenant, manifest);
  if (!attached.ok) throw new Error(`fixture inválida: ${JSON.stringify(attached.errors)}`);

  const repo = new InMemoryInstallationRepository();
  return repo.createInstallation({
    slug: request.clientSlug,
    company: request.clientName,
    status: "active",
    commercial: "production",
    technical: "running",
    tenant: attached.tenant,
  });
}

const FULL_MODULES = ["core.contacts", "core.pipeline", "channel.whatsapp", "automation.webhooks"];

describe("AUTOMATION_SIMULATION_SCENARIOS", () => {
  it("tem exatamente os 8 cenários documentados", () => {
    expect(AUTOMATION_SIMULATION_SCENARIOS).toEqual([
      "all_success",
      "webhook_retry_then_success",
      "webhook_retry_exhausted_fallback",
      "fallback_action_also_fails",
      "duplicate_trigger_idempotent_skip",
      "delayed_step_waiting",
      "workflow_inactive",
      "module_not_authorized",
    ]);
  });
});

describe("simulateWorkflowRun — determinismo (mesmo cenário sempre dá o mesmo resultado)", () => {
  it.each(AUTOMATION_SIMULATION_SCENARIOS)("%s é determinístico entre duas chamadas", async (scenario) => {
    const installation = await buildInstallation(FULL_MODULES);
    const a = await simulateWorkflowRun(scenario, { installation });
    const b = await simulateWorkflowRun(scenario, { installation });
    expect(a.run.status).toBe(b.run.status);
  });
});

describe("simulateWorkflowRun — cenários individuais", () => {
  it("all_success: resolve delay/retry sozinho e conclui", async () => {
    const installation = await buildInstallation(FULL_MODULES);
    const { run } = await simulateWorkflowRun("all_success", { installation });
    expect(run.status).toBe("completed");
    // O ramo de sucesso nunca toca "assign_owner_fallback" (só existe em onFailure) — fica "pending".
    expect(run.steps.find((s) => s.stepId === "tag_new_lead")?.status).toBe("completed");
    expect(run.steps.find((s) => s.stepId === "notify_webhook")?.status).toBe("completed");
    expect(run.steps.find((s) => s.stepId === "send_confirmation")?.status).toBe("completed");
    expect(run.steps.find((s) => s.stepId === "assign_owner_fallback")?.status).toBe("pending");
  });

  it("webhook_retry_then_success: falha 2x, sucede na 3ª, conclui", async () => {
    const installation = await buildInstallation(FULL_MODULES);
    const { run } = await simulateWorkflowRun("webhook_retry_then_success", { installation });
    expect(run.status).toBe("completed");
    expect(run.steps.find((s) => s.stepId === "notify_webhook")?.attempts).toBe(3);
  });

  it("webhook_retry_exhausted_fallback: esgota retry, fallback sucede, conclui", async () => {
    const installation = await buildInstallation(FULL_MODULES);
    const { run } = await simulateWorkflowRun("webhook_retry_exhausted_fallback", { installation });
    expect(run.status).toBe("completed");
    expect(run.steps.find((s) => s.stepId === "notify_webhook")?.status).toBe("failed");
    expect(run.steps.find((s) => s.stepId === "assign_owner_fallback")?.status).toBe("completed");
  });

  it("fallback_action_also_fails: esgota retry, fallback também falha, run failed", async () => {
    const installation = await buildInstallation(FULL_MODULES);
    const { run } = await simulateWorkflowRun("fallback_action_also_fails", { installation });
    expect(run.status).toBe("failed");
  });

  it("duplicate_trigger_idempotent_skip: segundo run é skipped_duplicate", async () => {
    const installation = await buildInstallation(FULL_MODULES);
    const { run } = await simulateWorkflowRun("duplicate_trigger_idempotent_skip", { installation });
    expect(run.status).toBe("skipped_duplicate");
  });

  it("delayed_step_waiting: pára em waiting sem resolver (uma só chamada de executeWorkflowRun)", async () => {
    const installation = await buildInstallation(FULL_MODULES);
    const { run, passes } = await simulateWorkflowRun("delayed_step_waiting", { installation });
    expect(run.status).toBe("waiting");
    expect(passes).toBe(1);
  });

  it("workflow_inactive: cancelled sem tocar nenhuma etapa", async () => {
    const installation = await buildInstallation(FULL_MODULES);
    const { run, passes } = await simulateWorkflowRun("workflow_inactive", { installation });
    expect(run.status).toBe("cancelled");
    expect(passes).toBe(0);
    expect(run.steps).toEqual([]);
  });

  it("module_not_authorized: failed na validação, antes de qualquer etapa", async () => {
    const installation = await buildInstallation(FULL_MODULES);
    const { run, passes } = await simulateWorkflowRun("module_not_authorized", { installation });
    expect(run.status).toBe("failed");
    expect(passes).toBe(0);
    expect(run.steps).toEqual([]);
  });
});

describe("simulateWorkflowRun — erro claro sem automation.webhooks habilitado", () => {
  it("lança erro explicando a ausência de workflow de demonstração", async () => {
    const installation = await buildInstallation(["core.contacts"]);
    await expect(simulateWorkflowRun("all_success", { installation })).rejects.toThrow(/automation\.webhooks/);
  });
});
