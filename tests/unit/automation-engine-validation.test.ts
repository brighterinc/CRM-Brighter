import { describe, expect, it } from "vitest";

import { detectCircularStepTransitions, validateWorkflowDefinition } from "@/lib/automation-engine/validation";
import type { WorkflowActionStep, WorkflowDefinition } from "@/lib/automation-engine/types";

const ALL_MODULES = ["core.contacts", "core.pipeline", "channel.whatsapp", "automation.webhooks", "automation.followups"];

function baseWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  const now = new Date().toISOString();
  const steps: WorkflowActionStep[] = [
    { id: "tag", name: "Tag", actionId: "add_tag", config: {}, onSuccess: "webhook" },
    { id: "webhook", name: "Webhook", actionId: "call_webhook", config: {}, retry: { maxAttempts: 3, backoffSeconds: 30 } },
  ];
  return {
    id: "wf-1",
    name: "Workflow de teste",
    description: "",
    installationId: "installation-1",
    triggerId: "lead.created",
    conditions: [],
    entryStepId: "tag",
    steps,
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("validateWorkflowDefinition", () => {
  it("workflow bem formado, todos os módulos autorizados → zero erros", () => {
    const errors = validateWorkflowDefinition({
      workflow: baseWorkflow(),
      enabledModuleIds: ALL_MODULES,
      deploymentPlan: "dedicated",
    });
    expect(errors).toEqual([]);
  });

  it("entryStepId apontando pra etapa inexistente é erro", () => {
    const errors = validateWorkflowDefinition({
      workflow: baseWorkflow({ entryStepId: "nao-existe" }),
      enabledModuleIds: ALL_MODULES,
      deploymentPlan: "dedicated",
    });
    expect(errors.some((e) => e.field === "entryStepId")).toBe(true);
  });

  it("gatilho inexistente no catálogo é erro", () => {
    const errors = validateWorkflowDefinition({
      workflow: baseWorkflow({ triggerId: "inexistente" }),
      enabledModuleIds: ALL_MODULES,
      deploymentPlan: "dedicated",
    });
    expect(errors.some((e) => e.field === "triggerId")).toBe(true);
  });

  it("gatilho cujo módulo não está habilitado é erro", () => {
    const errors = validateWorkflowDefinition({
      workflow: baseWorkflow(),
      enabledModuleIds: ["core.contacts"],
      deploymentPlan: "dedicated",
    });
    expect(errors.some((e) => e.field === "triggerId")).toBe(true);
  });

  it("módulo status:planned (automation.campaigns) nunca é autorizado mesmo se habilitado", () => {
    const errors = validateWorkflowDefinition({
      workflow: baseWorkflow({ triggerId: "campaign_step_due" }),
      enabledModuleIds: [...ALL_MODULES, "automation.campaigns"],
      deploymentPlan: "dedicated",
    });
    expect(errors.some((e) => e.field === "triggerId")).toBe(true);
  });

  it("actionId inexistente no catálogo é erro e interrompe checagem de módulo pra aquela etapa", () => {
    const workflow = baseWorkflow({
      steps: [{ id: "s1", name: "s1", actionId: "inexistente", config: {} }],
      entryStepId: "s1",
    });
    const errors = validateWorkflowDefinition({ workflow, enabledModuleIds: ALL_MODULES, deploymentPlan: "dedicated" });
    expect(errors).toEqual([{ field: "steps[s1].actionId", message: 'ação "inexistente" não existe no catálogo' }]);
  });

  it("onSuccess/onFailure apontando pra etapa inexistente é erro", () => {
    const workflow = baseWorkflow({
      steps: [{ id: "s1", name: "s1", actionId: "add_tag", config: {}, onSuccess: "fantasma", onFailure: "fantasma2" }],
      entryStepId: "s1",
    });
    const errors = validateWorkflowDefinition({ workflow, enabledModuleIds: ALL_MODULES, deploymentPlan: "dedicated" });
    expect(errors.some((e) => e.field === "steps[s1].onSuccess")).toBe(true);
    expect(errors.some((e) => e.field === "steps[s1].onFailure")).toBe(true);
  });

  it("delaySeconds negativo é erro", () => {
    const workflow = baseWorkflow({
      steps: [{ id: "s1", name: "s1", actionId: "add_tag", config: {}, delaySeconds: -5 }],
      entryStepId: "s1",
    });
    const errors = validateWorkflowDefinition({ workflow, enabledModuleIds: ALL_MODULES, deploymentPlan: "dedicated" });
    expect(errors.some((e) => e.field === "steps[s1].delaySeconds")).toBe(true);
  });

  it("retry numa ação com supportsRetry:false é erro (add_tag nunca suporta retry)", () => {
    const workflow = baseWorkflow({
      steps: [{ id: "s1", name: "s1", actionId: "add_tag", config: {}, retry: { maxAttempts: 3, backoffSeconds: 10 } }],
      entryStepId: "s1",
    });
    const errors = validateWorkflowDefinition({ workflow, enabledModuleIds: ALL_MODULES, deploymentPlan: "dedicated" });
    expect(errors.some((e) => e.field === "steps[s1].retry")).toBe(true);
  });

  it("retry.maxAttempts < 1 é erro", () => {
    const workflow = baseWorkflow({
      steps: [{ id: "s1", name: "s1", actionId: "call_webhook", config: {}, retry: { maxAttempts: 0, backoffSeconds: 10 } }],
      entryStepId: "s1",
    });
    const errors = validateWorkflowDefinition({ workflow, enabledModuleIds: ALL_MODULES, deploymentPlan: "dedicated" });
    expect(errors.some((e) => e.field === "steps[s1].retry.maxAttempts")).toBe(true);
  });

  it("etapa duplicada é erro", () => {
    const workflow = baseWorkflow({
      steps: [
        { id: "s1", name: "s1", actionId: "add_tag", config: {} },
        { id: "s1", name: "s1 dup", actionId: "add_tag", config: {} },
      ],
      entryStepId: "s1",
    });
    const errors = validateWorkflowDefinition({ workflow, enabledModuleIds: ALL_MODULES, deploymentPlan: "dedicated" });
    expect(errors.some((e) => e.message.includes("etapa duplicada"))).toBe(true);
  });

  it("ciclo entre etapas é detectado e reportado", () => {
    const workflow = baseWorkflow({
      steps: [
        { id: "a", name: "a", actionId: "add_tag", config: {}, onSuccess: "b" },
        { id: "b", name: "b", actionId: "add_tag", config: {}, onSuccess: "a" },
      ],
      entryStepId: "a",
    });
    const errors = validateWorkflowDefinition({ workflow, enabledModuleIds: ALL_MODULES, deploymentPlan: "dedicated" });
    expect(errors.some((e) => e.field === "steps" && e.message.includes("ciclo"))).toBe(true);
  });
});

describe("detectCircularStepTransitions", () => {
  it("devolve null pra grafo acíclico", () => {
    const steps: WorkflowActionStep[] = [
      { id: "a", name: "a", actionId: "add_tag", config: {}, onSuccess: "b", onFailure: "c" },
      { id: "b", name: "b", actionId: "add_tag", config: {} },
      { id: "c", name: "c", actionId: "add_tag", config: {} },
    ];
    expect(detectCircularStepTransitions(steps)).toBeNull();
  });

  it("devolve o ciclo (lista de ids) quando existe", () => {
    const steps: WorkflowActionStep[] = [
      { id: "a", name: "a", actionId: "add_tag", config: {}, onSuccess: "b" },
      { id: "b", name: "b", actionId: "add_tag", config: {}, onFailure: "a" },
    ];
    const cycle = detectCircularStepTransitions(steps);
    expect(cycle).not.toBeNull();
    expect(cycle).toContain("a");
    expect(cycle).toContain("b");
  });
});
