import { describe, expect, it } from "vitest";

import { generateDeploymentManifest } from "@/lib/deployment";
import { InMemoryInstallationRepository } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";
import { MODULE_CATALOG } from "@/lib/modules/catalog";
import type { Tenant } from "@/lib/tenants/types";
import { attachDeploymentManifest } from "@/lib/tenants/validation";

import { createDemoWorkflows } from "@/lib/automation-engine/repository";
import { generateAutomationSummary, renderAutomationSummaryMarkdown } from "@/lib/automation-engine/summary";
import { generateWorkflowRun } from "@/lib/automation-engine/planner";

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

describe("generateAutomationSummary", () => {
  it("instalação autorizada, sem runs → zero blockers, contadores zerados", async () => {
    const installation = await buildInstallation(FULL_MODULES);
    const workflows = createDemoWorkflows([installation]);
    const summary = generateAutomationSummary(installation, workflows, []);

    expect(summary.installationId).toBe(installation.id);
    expect(summary.totalWorkflows).toBe(1);
    expect(summary.activeWorkflows).toBe(1);
    expect(summary.totalRuns).toBe(0);
    expect(summary.blockers).toEqual([]);
  });

  it("workflow com etapa exigindo módulo não habilitado → blocker agregado", async () => {
    // habilita automation.webhooks (pro workflow existir) mas remove channel.whatsapp
    // (exigido pela etapa send_confirmation) — installation.modules não terá o módulo.
    const installation = await buildInstallation(["core.contacts", "core.pipeline", "automation.webhooks"]);
    const workflows = createDemoWorkflows([installation]);
    const summary = generateAutomationSummary(installation, workflows, []);

    expect(summary.blockers.length).toBeGreaterThan(0);
    expect(summary.blockers[0]).toContain("channel.whatsapp");
  });

  it("conta runs por status corretamente", async () => {
    const installation = await buildInstallation(FULL_MODULES);
    const [workflow] = createDemoWorkflows([installation]);
    const runs = [
      generateWorkflowRun({ workflow: workflow!, triggerPayload: { a: 1 }, enabledModuleIds: installation.modules, deploymentPlan: installation.deploymentPlan }),
      { ...generateWorkflowRun({ workflow: workflow!, triggerPayload: { a: 2 }, enabledModuleIds: installation.modules, deploymentPlan: installation.deploymentPlan }), status: "completed" as const },
      { ...generateWorkflowRun({ workflow: workflow!, triggerPayload: { a: 3 }, enabledModuleIds: installation.modules, deploymentPlan: installation.deploymentPlan }), status: "failed" as const },
    ];
    const summary = generateAutomationSummary(installation, [workflow!], runs);
    expect(summary.totalRuns).toBe(3);
    expect(summary.completedRuns).toBe(1);
    expect(summary.failedRuns).toBe(1);
    expect(summary.waitingRuns).toBe(1); // o primeiro fica "queued"
  });

  it("recentRuns nunca passa de 10, ordenado do mais recente pro mais antigo", async () => {
    const installation = await buildInstallation(FULL_MODULES);
    const [workflow] = createDemoWorkflows([installation]);
    const runs = Array.from({ length: 15 }, (_, i) => ({
      ...generateWorkflowRun({ workflow: workflow!, triggerPayload: { i }, enabledModuleIds: installation.modules, deploymentPlan: installation.deploymentPlan }),
      createdAt: new Date(2026, 0, i + 1).toISOString(),
    }));
    const summary = generateAutomationSummary(installation, [workflow!], runs);
    expect(summary.recentRuns).toHaveLength(10);
    expect(summary.recentRuns[0]!.createdAt >= summary.recentRuns[9]!.createdAt).toBe(true);
  });
});

describe("renderAutomationSummaryMarkdown", () => {
  it("inclui nome da instalação, contadores e mensagem 'nenhum blocker' quando limpo", async () => {
    const installation = await buildInstallation(FULL_MODULES);
    const workflows = createDemoWorkflows([installation]);
    const summary = generateAutomationSummary(installation, workflows, []);
    const md = renderAutomationSummaryMarkdown(summary);

    expect(md).toContain(installation.company);
    expect(md).toContain("## Workflows");
    expect(md).toContain("Nenhum — todos os workflows autorizados.");
  });

  it("mostra 'Nenhum workflow configurado' quando não há nenhum", async () => {
    const installation = await buildInstallation(["core.contacts"]);
    const summary = generateAutomationSummary(installation, [], []);
    const md = renderAutomationSummaryMarkdown(summary);
    expect(md).toContain("Nenhum workflow configurado.");
  });
});
