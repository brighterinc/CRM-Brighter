import { describe, expect, it } from "vitest";

import { generateDeploymentManifest } from "@/lib/deployment";
import { InMemoryInstallationRepository } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";
import { MODULE_CATALOG } from "@/lib/modules/catalog";
import type { Tenant } from "@/lib/tenants/types";
import { attachDeploymentManifest } from "@/lib/tenants/validation";

import { createDemoWorkflows, InMemoryWorkflowRepository } from "@/lib/automation-engine/repository";
import type { WorkflowDefinition, WorkflowRun } from "@/lib/automation-engine/types";

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

describe("createDemoWorkflows", () => {
  it("instalação sem automation.webhooks habilitado → zero workflows de demonstração", async () => {
    const installation = await buildInstallation(["core.contacts", "core.pipeline"]);
    expect(createDemoWorkflows([installation])).toEqual([]);
  });

  it("instalação com automation.webhooks habilitado → 1 workflow com ramificação, delay e retry", async () => {
    const installation = await buildInstallation(["core.contacts", "core.pipeline", "channel.whatsapp", "automation.webhooks"]);
    const [workflow] = createDemoWorkflows([installation]);
    expect(workflow).toBeDefined();
    expect(workflow!.installationId).toBe(installation.id);
    expect(workflow!.steps.some((s) => s.retry)).toBe(true);
    expect(workflow!.steps.some((s) => s.delaySeconds)).toBe(true);
    expect(workflow!.steps.some((s) => s.onFailure)).toBe(true);
  });
});

describe("InMemoryWorkflowRepository", () => {
  const workflow: WorkflowDefinition = {
    id: "wf-1",
    name: "Workflow de teste",
    description: "",
    installationId: "installation-1",
    triggerId: "lead.created",
    conditions: [],
    entryStepId: "a",
    steps: [{ id: "a", name: "a", actionId: "add_tag", config: {} }],
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const run: WorkflowRun = {
    id: "run-1",
    workflowId: "wf-1",
    installationId: "installation-1",
    status: "queued",
    triggerFingerprint: "wf_abc",
    steps: [],
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("cada instância começa vazia", async () => {
    const repo = new InMemoryWorkflowRepository();
    expect(await repo.listWorkflows()).toEqual([]);
    expect(await repo.listRuns()).toEqual([]);
  });

  it("saveWorkflow/findWorkflow/listWorkflows", async () => {
    const repo = new InMemoryWorkflowRepository();
    await repo.saveWorkflow(workflow);
    expect(await repo.findWorkflow("wf-1")).toEqual(workflow);
    expect(await repo.findWorkflow("nao-existe")).toBeNull();
    expect(await repo.listWorkflows("installation-1")).toEqual([workflow]);
    expect(await repo.listWorkflows("outra-instalacao")).toEqual([]);
  });

  it("saveRun/findRun/listRuns", async () => {
    const repo = new InMemoryWorkflowRepository();
    await repo.saveRun(run);
    expect(await repo.findRun("run-1")).toEqual(run);
    expect(await repo.findRun("nao-existe")).toBeNull();
    expect(await repo.listRuns("wf-1")).toEqual([run]);
    expect(await repo.listRuns("outro-workflow")).toEqual([]);
  });

  it("seed no construtor popula o repositório", async () => {
    const repo = new InMemoryWorkflowRepository({ workflows: [workflow], runs: [run] });
    expect(await repo.listWorkflows()).toEqual([workflow]);
    expect(await repo.listRuns()).toEqual([run]);
  });
});
