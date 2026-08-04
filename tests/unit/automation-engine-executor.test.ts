import { describe, expect, it } from "vitest";

import {
  executeWorkflowRun,
  InMemoryWorkflowActionAdapter,
  NoopWorkflowActionAdapter,
} from "@/lib/automation-engine/executor";
import { generateWorkflowRun } from "@/lib/automation-engine/planner";
import type { WorkflowActionStep, WorkflowDefinition } from "@/lib/automation-engine/types";

const ALL_MODULES = ["core.contacts", "core.pipeline", "channel.whatsapp", "automation.webhooks"];
const NOW = new Date("2026-01-01T00:00:00.000Z");

function workflow(steps: WorkflowActionStep[], entryStepId = steps[0]!.id): WorkflowDefinition {
  const now = NOW.toISOString();
  return {
    id: "wf-1",
    name: "Workflow de teste",
    description: "",
    installationId: "installation-1",
    triggerId: "lead.created",
    conditions: [],
    entryStepId,
    steps,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

function queuedRun(wf: WorkflowDefinition) {
  return generateWorkflowRun({
    workflow: wf,
    triggerPayload: { lead_id: "l1" },
    enabledModuleIds: ALL_MODULES,
    deploymentPlan: "dedicated",
  });
}

describe("executeWorkflowRun — NoopWorkflowActionAdapter", () => {
  it("workflow linear de 2 etapas conclui com sucesso, nunca toca rede", async () => {
    const wf = workflow([
      { id: "a", name: "a", actionId: "add_tag", config: {}, onSuccess: "b" },
      { id: "b", name: "b", actionId: "call_webhook", config: {} },
    ]);
    const { run } = await executeWorkflowRun(queuedRun(wf), wf, new NoopWorkflowActionAdapter(), { now: NOW });
    expect(run.status).toBe("completed");
    expect(run.steps.every((s) => s.status === "completed")).toBe(true);
  });

  it("run terminal (completed/failed/cancelled/skipped_duplicate) é no-op — nunca reprocessa", async () => {
    const wf = workflow([{ id: "a", name: "a", actionId: "add_tag", config: {} }]);
    const run = { ...queuedRun(wf), status: "completed" as const };
    const { run: result, history } = await executeWorkflowRun(run, wf, new NoopWorkflowActionAdapter(), { now: NOW });
    expect(result).toEqual(run); // clone (structuredClone), não a mesma referência — mas conteúdo idêntico
    expect(history).toEqual([]);
  });
});

describe("executeWorkflowRun — ramificação (branch)", () => {
  it("onSuccess é seguido quando a ação sucede", async () => {
    const wf = workflow([
      { id: "a", name: "a", actionId: "add_tag", config: {}, onSuccess: "success_branch", onFailure: "failure_branch" },
      { id: "success_branch", name: "s", actionId: "assign_owner", config: {} },
      { id: "failure_branch", name: "f", actionId: "assign_owner", config: {} },
    ]);
    const { run } = await executeWorkflowRun(queuedRun(wf), wf, new NoopWorkflowActionAdapter(), { now: NOW });
    expect(run.status).toBe("completed");
    expect(run.steps.find((s) => s.stepId === "success_branch")?.status).toBe("completed");
    expect(run.steps.find((s) => s.stepId === "failure_branch")?.status).toBe("pending");
  });

  it("onFailure é seguido quando a ação falha (sem retry configurado)", async () => {
    const wf = workflow([
      { id: "a", name: "a", actionId: "add_tag", config: {}, onSuccess: "success_branch", onFailure: "failure_branch" },
      { id: "success_branch", name: "s", actionId: "assign_owner", config: {} },
      { id: "failure_branch", name: "f", actionId: "assign_owner", config: {} },
    ]);
    const adapter = new InMemoryWorkflowActionAdapter({ failStepIds: new Set(["a"]) });
    const { run } = await executeWorkflowRun(queuedRun(wf), wf, adapter, { now: NOW });
    expect(run.status).toBe("completed");
    expect(run.steps.find((s) => s.stepId === "failure_branch")?.status).toBe("completed");
    expect(run.steps.find((s) => s.stepId === "success_branch")?.status).toBe("pending");
  });

  it("falha sem onFailure definido → run failed", async () => {
    const wf = workflow([{ id: "a", name: "a", actionId: "add_tag", config: {} }]);
    const adapter = new InMemoryWorkflowActionAdapter({ failStepIds: new Set(["a"]) });
    const { run } = await executeWorkflowRun(queuedRun(wf), wf, adapter, { now: NOW });
    expect(run.status).toBe("failed");
    expect(run.steps[0]?.status).toBe("failed");
  });

  it("skipped segue pelo mesmo ramo de onSuccess", async () => {
    const wf = workflow([
      { id: "a", name: "a", actionId: "add_tag", config: {}, onSuccess: "b" },
      { id: "b", name: "b", actionId: "assign_owner", config: {} },
    ]);
    const adapter = new InMemoryWorkflowActionAdapter({ skipStepIds: new Set(["a"]) });
    const { run } = await executeWorkflowRun(queuedRun(wf), wf, adapter, { now: NOW });
    expect(run.steps.find((s) => s.stepId === "a")?.status).toBe("skipped");
    expect(run.steps.find((s) => s.stepId === "b")?.status).toBe("completed");
    expect(run.status).toBe("completed");
  });
});

describe("executeWorkflowRun — delay (nunca sleep real)", () => {
  it("etapa com delaySeconds pára em waiting_delay com nextAttemptAt calculado, sem sleep", async () => {
    const wf = workflow([{ id: "a", name: "a", actionId: "add_tag", config: {}, delaySeconds: 60 }]);
    const { run } = await executeWorkflowRun(queuedRun(wf), wf, new NoopWorkflowActionAdapter(), { now: NOW });
    expect(run.status).toBe("waiting");
    const step = run.steps.find((s) => s.stepId === "a")!;
    expect(step.status).toBe("waiting_delay");
    expect(step.nextAttemptAt).toBe(new Date(NOW.getTime() + 60_000).toISOString());
    expect(step.attempts).toBe(0); // ainda não executou de verdade
  });

  it("chamada seguinte ANTES do nextAttemptAt continua parada", async () => {
    const wf = workflow([{ id: "a", name: "a", actionId: "add_tag", config: {}, delaySeconds: 60 }]);
    const first = await executeWorkflowRun(queuedRun(wf), wf, new NoopWorkflowActionAdapter(), { now: NOW });
    const almostThere = new Date(NOW.getTime() + 59_000);
    const second = await executeWorkflowRun(first.run, wf, new NoopWorkflowActionAdapter(), { now: almostThere });
    expect(second.run.status).toBe("waiting");
    expect(second.run.steps[0]?.attempts).toBe(0);
  });

  it("chamada seguinte DEPOIS do nextAttemptAt executa a etapa", async () => {
    const wf = workflow([{ id: "a", name: "a", actionId: "add_tag", config: {}, delaySeconds: 60 }]);
    const first = await executeWorkflowRun(queuedRun(wf), wf, new NoopWorkflowActionAdapter(), { now: NOW });
    const later = new Date(NOW.getTime() + 61_000);
    const second = await executeWorkflowRun(first.run, wf, new NoopWorkflowActionAdapter(), { now: later });
    expect(second.run.status).toBe("completed");
    expect(second.run.steps[0]?.status).toBe("completed");
    expect(second.run.steps[0]?.attempts).toBe(1);
  });
});

describe("executeWorkflowRun — retry", () => {
  it("falha com retry disponível → status retrying, nextAttemptAt = now + backoff, run waiting", async () => {
    const wf = workflow([{ id: "a", name: "a", actionId: "call_webhook", config: {}, retry: { maxAttempts: 3, backoffSeconds: 30 } }]);
    const adapter = new InMemoryWorkflowActionAdapter({ failStepIds: new Set(["a"]) });
    const { run } = await executeWorkflowRun(queuedRun(wf), wf, adapter, { now: NOW });
    expect(run.status).toBe("waiting");
    const step = run.steps[0]!;
    expect(step.status).toBe("retrying");
    expect(step.attempts).toBe(1);
    expect(step.nextAttemptAt).toBe(new Date(NOW.getTime() + 30_000).toISOString());
  });

  it("retry esgotado (maxAttempts atingido) → falha final, segue onFailure", async () => {
    const wf = workflow([
      { id: "a", name: "a", actionId: "call_webhook", config: {}, retry: { maxAttempts: 2, backoffSeconds: 10 }, onFailure: "fallback" },
      { id: "fallback", name: "fallback", actionId: "assign_owner", config: {} },
    ]);
    const adapter = new InMemoryWorkflowActionAdapter({ failStepIds: new Set(["a"]) });

    let current = queuedRun(wf);
    let now = NOW;
    // 1ª chamada: falha, agenda retry (attempts=1)
    let result = await executeWorkflowRun(current, wf, adapter, { now });
    expect(result.run.steps[0]?.status).toBe("retrying");
    current = result.run;

    // 2ª chamada, depois do backoff: falha de novo, esgota (attempts=2 === maxAttempts) → segue onFailure
    now = new Date(now.getTime() + 11_000);
    result = await executeWorkflowRun(current, wf, adapter, { now });
    expect(result.run.status).toBe("completed"); // fallback sucede
    expect(result.run.steps.find((s) => s.stepId === "a")?.status).toBe("failed");
    expect(result.run.steps.find((s) => s.stepId === "a")?.attempts).toBe(2);
    expect(result.run.steps.find((s) => s.stepId === "fallback")?.status).toBe("completed");
  });

  it("etapa completed nunca reexecuta — idempotência de etapa", async () => {
    const wf = workflow([{ id: "a", name: "a", actionId: "add_tag", config: {} }]);
    const first = await executeWorkflowRun(queuedRun(wf), wf, new NoopWorkflowActionAdapter(), { now: NOW });
    expect(first.run.status).toBe("completed");

    // Força o run de volta pra "running" com currentStepId apontando pra etapa já completed —
    // simula uma reentrada indevida (nunca deveria acontecer em uso normal).
    const tampered = { ...first.run, status: "running" as const, currentStepId: "a" };
    const second = await executeWorkflowRun(tampered, wf, new NoopWorkflowActionAdapter(), { now: NOW });
    expect(second.run.status).toBe("failed");
    expect(second.history[0]?.event).toBe("run.step_already_completed");
  });
});
