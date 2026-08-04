/**
 * Validação pura do Brighter Automation Engine — Foundation v1. Cada função
 * devolve `WorkflowValidationError[]` (dot-path `field`) — nunca lança.
 *
 * Módulo `status: "planned"` (ex.: `automation.campaigns`) nunca é
 * autorizado, mesma regra de `resolveBillingEntitlements`
 * (`lib/billing/entitlements.ts`) — reusa `MODULE_CATALOG` diretamente,
 * nunca reimplementa a noção de "módulo planejado nunca autorizado".
 */
import { MODULE_CATALOG } from "@/lib/modules/catalog";

import { getWorkflowActionDefinition, getWorkflowTriggerDefinition } from "./catalog";
import type { WorkflowActionStep, WorkflowDefinition, WorkflowValidationError } from "./types";

export type ValidateWorkflowDefinitionInput = {
  workflow: WorkflowDefinition;
  enabledModuleIds: string[];
  deploymentPlan: string;
};

function isModuleAuthorized(moduleId: string, enabledModuleIds: string[], deploymentPlan: string): boolean {
  const moduleDef = MODULE_CATALOG.find((m) => m.id === moduleId);
  if (!moduleDef) return false;
  if (moduleDef.status === "planned") return false;
  if (!moduleDef.allowedPlans.includes(deploymentPlan as never)) return false;
  return enabledModuleIds.includes(moduleId);
}

/** DFS com pilha de recursão sobre as arestas `onSuccess`/`onFailure` — devolve o primeiro ciclo encontrado ou `null`. */
export function detectCircularStepTransitions(steps: WorkflowActionStep[]): string[] | null {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const stack: string[] = [];
  const stackSet = new Set<string>();

  function visit(id: string): string[] | null {
    if (stackSet.has(id)) {
      const cycleStart = stack.indexOf(id);
      return [...stack.slice(cycleStart), id];
    }
    if (visited.has(id)) return null;

    visited.add(id);
    stack.push(id);
    stackSet.add(id);

    const def = byId.get(id);
    const nextIds = [def?.onSuccess, def?.onFailure].filter((v): v is string => Boolean(v));
    for (const nextId of nextIds) {
      if (!byId.has(nextId)) continue;
      const cycle = visit(nextId);
      if (cycle) return cycle;
    }

    stack.pop();
    stackSet.delete(id);
    return null;
  }

  for (const s of steps) {
    const cycle = visit(s.id);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Validação estrutural + de entitlement de um `WorkflowDefinition` completo.
 * NUNCA muta o workflow — só reporta.
 */
export function validateWorkflowDefinition(input: ValidateWorkflowDefinitionInput): WorkflowValidationError[] {
  const { workflow, enabledModuleIds, deploymentPlan } = input;
  const errors: WorkflowValidationError[] = [];

  const stepIds = new Set<string>();
  for (const step of workflow.steps) {
    if (stepIds.has(step.id)) {
      errors.push({ field: `steps[${step.id}].id`, message: `etapa duplicada: "${step.id}"` });
    }
    stepIds.add(step.id);
  }

  if (!stepIds.has(workflow.entryStepId)) {
    errors.push({
      field: "entryStepId",
      message: `entryStepId "${workflow.entryStepId}" não corresponde a nenhuma etapa do workflow`,
    });
  }

  const trigger = getWorkflowTriggerDefinition(workflow.triggerId);
  if (!trigger) {
    errors.push({ field: "triggerId", message: `gatilho "${workflow.triggerId}" não existe no catálogo` });
  } else if (!isModuleAuthorized(trigger.requiresModule, enabledModuleIds, deploymentPlan)) {
    errors.push({
      field: "triggerId",
      message: `gatilho "${workflow.triggerId}" exige o módulo "${trigger.requiresModule}", não autorizado nesta instalação`,
    });
  }

  for (const step of workflow.steps) {
    if (step.onSuccess && !stepIds.has(step.onSuccess)) {
      errors.push({
        field: `steps[${step.id}].onSuccess`,
        message: `onSuccess "${step.onSuccess}" não corresponde a nenhuma etapa do workflow`,
      });
    }
    if (step.onFailure && !stepIds.has(step.onFailure)) {
      errors.push({
        field: `steps[${step.id}].onFailure`,
        message: `onFailure "${step.onFailure}" não corresponde a nenhuma etapa do workflow`,
      });
    }

    const action = getWorkflowActionDefinition(step.actionId);
    if (!action) {
      errors.push({ field: `steps[${step.id}].actionId`, message: `ação "${step.actionId}" não existe no catálogo` });
      continue;
    }
    if (!isModuleAuthorized(action.requiresModule, enabledModuleIds, deploymentPlan)) {
      errors.push({
        field: `steps[${step.id}].actionId`,
        message: `ação "${step.actionId}" exige o módulo "${action.requiresModule}", não autorizado nesta instalação`,
      });
    }

    if (step.delaySeconds !== undefined) {
      if (step.delaySeconds < 0) {
        errors.push({ field: `steps[${step.id}].delaySeconds`, message: "delaySeconds não pode ser negativo" });
      } else if (!action.supportsDelay) {
        errors.push({
          field: `steps[${step.id}].delaySeconds`,
          message: `ação "${step.actionId}" não suporta delay (supportsDelay: false)`,
        });
      }
    }

    if (step.retry) {
      if (step.retry.maxAttempts < 1) {
        errors.push({ field: `steps[${step.id}].retry.maxAttempts`, message: "maxAttempts precisa ser >= 1" });
      }
      if (step.retry.backoffSeconds < 0) {
        errors.push({ field: `steps[${step.id}].retry.backoffSeconds`, message: "backoffSeconds não pode ser negativo" });
      }
      if (!action.supportsRetry) {
        errors.push({
          field: `steps[${step.id}].retry`,
          message: `ação "${step.actionId}" não suporta retry (supportsRetry: false)`,
        });
      }
    }
  }

  const cycle = detectCircularStepTransitions(workflow.steps);
  if (cycle) {
    errors.push({ field: "steps", message: `ciclo detectado entre etapas: ${cycle.join(" → ")}` });
  }

  return errors;
}
