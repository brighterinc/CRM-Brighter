/**
 * Simulação determinística do Brighter Automation Engine — Foundation v1.
 *
 * `simulateWorkflowRun` é o dry-run pedido — sempre usa
 * `InMemoryWorkflowActionAdapter`, nunca uma ação real. Cada cenário é
 * NOMEADO e determinístico (contador interno do adapter, nunca `Math.random`)
 * — mesmo espírito de `simulateProvisioning`/`simulateMonitoringRun`.
 *
 * Delay/retry nunca usam `setTimeout` real: `resolveUntilSettled` avança um
 * relógio VIRTUAL (`now`) pro `nextAttemptAt` já calculado por
 * `executeWorkflowRun`, chamando o executor de novo — o "avanço do tempo" é
 * só aritmética de `Date`, nunca espera de verdade.
 */
import { createDemoInstallations } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";

import { createDemoWorkflows } from "./repository";
import { executeWorkflowRun, InMemoryWorkflowActionAdapter } from "./executor";
import { generateWorkflowRun } from "./planner";
import type { WorkflowDefinition, WorkflowRun } from "./types";

export type AutomationSimulationScenario =
  | "all_success"
  | "webhook_retry_then_success"
  | "webhook_retry_exhausted_fallback"
  | "fallback_action_also_fails"
  | "duplicate_trigger_idempotent_skip"
  | "delayed_step_waiting"
  | "workflow_inactive"
  | "module_not_authorized";

export const AUTOMATION_SIMULATION_SCENARIOS: AutomationSimulationScenario[] = [
  "all_success",
  "webhook_retry_then_success",
  "webhook_retry_exhausted_fallback",
  "fallback_action_also_fails",
  "duplicate_trigger_idempotent_skip",
  "delayed_step_waiting",
  "workflow_inactive",
  "module_not_authorized",
];

export type SimulateWorkflowRunOptions = {
  installation?: Installation;
  workflow?: WorkflowDefinition;
  triggerPayload?: Record<string, unknown>;
};

export type SimulateWorkflowRunResult = {
  scenario: AutomationSimulationScenario;
  run: WorkflowRun;
  /** Quantas vezes `executeWorkflowRun` foi chamado até o run assentar (ou até o teto de segurança). */
  passes: number;
};

const MAX_PASSES = 20;

/** Chama `executeWorkflowRun` repetidamente, avançando o relógio virtual até o `nextAttemptAt` de cada pausa, até o run sair de queued/running/waiting. */
async function resolveUntilSettled(
  run: WorkflowRun,
  workflow: WorkflowDefinition,
  adapter: InMemoryWorkflowActionAdapter,
  startNow: Date,
): Promise<{ run: WorkflowRun; passes: number }> {
  let current = run;
  let now = startNow;
  let passes = 0;

  while (current.status === "queued" || current.status === "running" || current.status === "waiting") {
    passes += 1;
    if (passes > MAX_PASSES) break;

    const result = await executeWorkflowRun(current, workflow, adapter, { now });
    current = result.run;

    if (current.status === "waiting" && current.currentStepId) {
      const stepState = current.steps.find((s) => s.stepId === current.currentStepId);
      if (stepState?.nextAttemptAt) {
        now = new Date(new Date(stepState.nextAttemptAt).getTime() + 1);
      } else {
        break; // sem carimbo pra avançar — nunca deveria acontecer, freio de segurança
      }
    }
  }

  return { run: current, passes };
}

export async function simulateWorkflowRun(
  scenario: AutomationSimulationScenario,
  opts: SimulateWorkflowRunOptions = {},
): Promise<SimulateWorkflowRunResult> {
  const installation = opts.installation ?? createDemoInstallations()[0];
  if (!installation) throw new Error("simulate_workflow_run: nenhuma Installation de demonstração disponível");

  const effectiveInstallation =
    scenario === "module_not_authorized"
      ? { ...installation, modules: installation.modules.filter((m) => m !== "channel.whatsapp") }
      : installation;

  const demoWorkflow = opts.workflow ?? createDemoWorkflows([installation])[0];
  if (!demoWorkflow) {
    throw new Error(
      `simulate_workflow_run: instalação "${installation.slug}" não tem "automation.webhooks" habilitado — sem workflow de demonstração`,
    );
  }
  const workflow = scenario === "workflow_inactive" ? { ...demoWorkflow, status: "paused" as const } : demoWorkflow;

  const triggerPayload = opts.triggerPayload ?? { lead_id: "demo-lead-1" };
  const now = new Date(workflow.updatedAt);

  const plannerInput = {
    workflow,
    triggerPayload,
    enabledModuleIds: effectiveInstallation.modules,
    deploymentPlan: effectiveInstallation.deploymentPlan,
  };

  if (scenario === "workflow_inactive" || scenario === "module_not_authorized") {
    return { scenario, run: generateWorkflowRun(plannerInput), passes: 0 };
  }

  if (scenario === "duplicate_trigger_idempotent_skip") {
    const first = generateWorkflowRun(plannerInput);
    const duplicate = generateWorkflowRun({ ...plannerInput, existingRuns: [first] });
    return { scenario, run: duplicate, passes: 0 };
  }

  const run = generateWorkflowRun(plannerInput);

  if (scenario === "delayed_step_waiting") {
    const adapter = new InMemoryWorkflowActionAdapter();
    const result = await executeWorkflowRun(run, workflow, adapter, { now });
    return { scenario, run: result.run, passes: 1 };
  }

  const adapter =
    scenario === "webhook_retry_then_success"
      ? new InMemoryWorkflowActionAdapter({ failFirstAttempts: new Map([["notify_webhook", 2]]) })
      : scenario === "webhook_retry_exhausted_fallback"
        ? new InMemoryWorkflowActionAdapter({ failStepIds: new Set(["notify_webhook"]) })
        : scenario === "fallback_action_also_fails"
          ? new InMemoryWorkflowActionAdapter({ failStepIds: new Set(["notify_webhook", "assign_owner_fallback"]) })
          : new InMemoryWorkflowActionAdapter(); // all_success

  const settled = await resolveUntilSettled(run, workflow, adapter, now);
  return { scenario, run: settled.run, passes: settled.passes };
}
