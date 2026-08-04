import { describe, expect, it } from "vitest";

import { calculateTriggerFingerprint, generateWorkflowRun } from "@/lib/automation-engine/planner";
import type { WorkflowActionStep, WorkflowDefinition, WorkflowRun } from "@/lib/automation-engine/types";

const ALL_MODULES = ["core.contacts", "core.pipeline", "channel.whatsapp", "automation.webhooks"];

function workflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  const now = new Date().toISOString();
  const steps: WorkflowActionStep[] = [
    { id: "tag", name: "Tag", actionId: "add_tag", config: {}, onSuccess: "webhook" },
    { id: "webhook", name: "Webhook", actionId: "call_webhook", config: {} },
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

describe("calculateTriggerFingerprint", () => {
  it("determinístico — mesmo input sempre gera o mesmo fingerprint", () => {
    const a = calculateTriggerFingerprint({ workflowId: "wf-1", triggerPayload: { lead_id: "l1", stage: "novo" } });
    const b = calculateTriggerFingerprint({ workflowId: "wf-1", triggerPayload: { stage: "novo", lead_id: "l1" } });
    expect(a).toBe(b); // ordem de chaves não importa
  });

  it("payload diferente gera fingerprint diferente", () => {
    const a = calculateTriggerFingerprint({ workflowId: "wf-1", triggerPayload: { lead_id: "l1" } });
    const b = calculateTriggerFingerprint({ workflowId: "wf-1", triggerPayload: { lead_id: "l2" } });
    expect(a).not.toBe(b);
  });

  it("workflowId diferente gera fingerprint diferente pro mesmo payload", () => {
    const a = calculateTriggerFingerprint({ workflowId: "wf-1", triggerPayload: { lead_id: "l1" } });
    const b = calculateTriggerFingerprint({ workflowId: "wf-2", triggerPayload: { lead_id: "l1" } });
    expect(a).not.toBe(b);
  });
});

describe("generateWorkflowRun", () => {
  it("workflow ativo e válido → status queued, etapa de entrada ready, demais pending", () => {
    const run = generateWorkflowRun({
      workflow: workflow(),
      triggerPayload: { lead_id: "l1" },
      enabledModuleIds: ALL_MODULES,
      deploymentPlan: "dedicated",
    });
    expect(run.status).toBe("queued");
    expect(run.steps.find((s) => s.stepId === "tag")?.status).toBe("ready");
    expect(run.steps.find((s) => s.stepId === "webhook")?.status).toBe("pending");
    expect(run.history).toHaveLength(1);
    expect(run.history[0]?.event).toBe("run.queued");
  });

  it("workflow não ativo (paused) → status cancelled, sem nenhuma etapa", () => {
    const run = generateWorkflowRun({
      workflow: workflow({ status: "paused" }),
      triggerPayload: {},
      enabledModuleIds: ALL_MODULES,
      deploymentPlan: "dedicated",
    });
    expect(run.status).toBe("cancelled");
    expect(run.steps).toEqual([]);
  });

  it("workflow inválido (módulo não autorizado) → status failed, sem nenhuma etapa", () => {
    const run = generateWorkflowRun({
      workflow: workflow(),
      triggerPayload: {},
      enabledModuleIds: ["core.contacts"], // falta automation.webhooks pro gatilho
      deploymentPlan: "dedicated",
    });
    expect(run.status).toBe("failed");
    expect(run.steps).toEqual([]);
    expect(run.history[0]?.event).toBe("run.validation_failed");
  });

  it("fingerprint duplicado entre um run queued/running/waiting/completed → skipped_duplicate", () => {
    const input = {
      workflow: workflow(),
      triggerPayload: { lead_id: "l1" },
      enabledModuleIds: ALL_MODULES,
      deploymentPlan: "dedicated",
    };
    const first = generateWorkflowRun(input);
    const duplicate = generateWorkflowRun({ ...input, existingRuns: [first] });
    expect(duplicate.status).toBe("skipped_duplicate");
    expect(duplicate.triggerFingerprint).toBe(first.triggerFingerprint);
  });

  it("fingerprint diferente (payload diferente) nunca é bloqueado por idempotência", () => {
    const input = {
      workflow: workflow(),
      enabledModuleIds: ALL_MODULES,
      deploymentPlan: "dedicated",
    };
    const first = generateWorkflowRun({ ...input, triggerPayload: { lead_id: "l1" } });
    const second = generateWorkflowRun({ ...input, triggerPayload: { lead_id: "l2" }, existingRuns: [first] });
    expect(second.status).toBe("queued");
  });

  it("run duplicado contra um run já terminal (failed/cancelled) NÃO é bloqueado — só queued/running/waiting/completed bloqueiam", () => {
    const input = {
      workflow: workflow(),
      triggerPayload: { lead_id: "l1" },
      enabledModuleIds: ALL_MODULES,
      deploymentPlan: "dedicated",
    };
    const terminalRun: WorkflowRun = { ...generateWorkflowRun(input), status: "failed" };
    const next = generateWorkflowRun({ ...input, existingRuns: [terminalRun] });
    expect(next.status).toBe("queued");
  });
});
