/**
 * Validação pura da Outreach & AI Cadence Engine — Foundation v1. Cada
 * função devolve `OutreachValidationError[]` (dot-path `field`) — nunca
 * lança.
 *
 * Módulo `status: "planned"` (ex.: `automation.campaigns`, hoje o único
 * requisito de toda entrada do catálogo — ver `catalog.ts`) nunca é
 * autorizado, mesma regra de `resolveBillingEntitlements`
 * (`lib/billing/entitlements.ts`) e de `validateWorkflowDefinition`
 * (`lib/automation-engine/validation.ts`) — reusa `MODULE_CATALOG`
 * diretamente, nunca reimplementa a noção de "módulo planejado nunca
 * autorizado".
 */
import { MODULE_CATALOG } from "@/lib/modules/catalog";

import { getOutreachCadenceStepTypeDefinition, getOutreachCampaignTypeDefinition } from "./catalog";
import type { OutreachCadence, OutreachCadenceStep, OutreachCampaign, OutreachSegment, OutreachValidationError } from "./types";

export function isModuleAuthorized(moduleId: string, enabledModuleIds: string[], deploymentPlan: string): boolean {
  const moduleDef = MODULE_CATALOG.find((m) => m.id === moduleId);
  if (!moduleDef) return false;
  if (moduleDef.status === "planned") return false;
  if (!moduleDef.allowedPlans.includes(deploymentPlan as never)) return false;
  return enabledModuleIds.includes(moduleId);
}

/** DFS com pilha de recursão sobre `onSuccess`/`onFailure` — devolve o primeiro ciclo encontrado ou `null`. Mesmo algoritmo de `detectCircularStepTransitions` (`lib/automation-engine/validation.ts`), redeclarado aqui porque opera sobre `OutreachCadenceStep` (arestas em array, não escalar). */
export function detectCircularCadenceSteps(steps: OutreachCadenceStep[]): string[] | null {
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
    const nextIds = [...(def?.onSuccess ?? []), ...(def?.onFailure ?? [])];
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

export type ValidateOutreachSegmentInput = { segment: OutreachSegment };

export function validateSegment(input: ValidateOutreachSegmentInput): OutreachValidationError[] {
  const { segment } = input;
  const errors: OutreachValidationError[] = [];

  if (segment.name.trim().length === 0) {
    errors.push({ field: "name", message: "nome do segmento não pode ser vazio" });
  }
  if (segment.maxAudienceSize !== undefined && segment.maxAudienceSize < 1) {
    errors.push({ field: "maxAudienceSize", message: "maxAudienceSize precisa ser >= 1" });
  }
  segment.filters.forEach((filter, index) => {
    if (filter.field.trim().length === 0) {
      errors.push({ field: `filters[${index}].field`, message: "campo do filtro não pode ser vazio" });
    }
    if ((filter.op === "eq" || filter.op === "neq" || filter.op === "contains" || filter.op === "not_contains") && filter.value === undefined) {
      errors.push({ field: `filters[${index}].value`, message: `operador "${filter.op}" exige "value"` });
    }
    if ((filter.op === "in" || filter.op === "not_in") && !Array.isArray(filter.value)) {
      errors.push({ field: `filters[${index}].value`, message: `operador "${filter.op}" exige "value" como array` });
    }
  });

  return errors;
}

export type ValidateOutreachCadenceInput = {
  cadence: OutreachCadence;
  enabledModuleIds: string[];
  deploymentPlan: string;
};

/** Validação estrutural + de entitlement de uma `OutreachCadence` completa. NUNCA muta a cadência — só reporta. */
export function validateCadence(input: ValidateOutreachCadenceInput): OutreachValidationError[] {
  const { cadence, enabledModuleIds, deploymentPlan } = input;
  const errors: OutreachValidationError[] = [];

  if (cadence.steps.length === 0) {
    errors.push({ field: "steps", message: "cadência precisa de pelo menos uma etapa" });
    return errors;
  }

  const stepIds = new Set<string>();
  for (const step of cadence.steps) {
    if (stepIds.has(step.id)) {
      errors.push({ field: `steps[${step.id}].id`, message: `etapa duplicada: "${step.id}"` });
    }
    stepIds.add(step.id);
  }

  const orders = cadence.steps.map((s) => s.order);
  if (new Set(orders).size !== orders.length) {
    errors.push({ field: "steps", message: "existem etapas com o mesmo `order` — ordem precisa ser única" });
  }

  for (const step of cadence.steps) {
    const stepType = getOutreachCadenceStepTypeDefinition(step.type);
    if (!stepType) {
      errors.push({ field: `steps[${step.id}].type`, message: `tipo de etapa "${step.type}" não existe no catálogo` });
      continue;
    }

    if (step.type === "message" || step.type === "email") {
      if (!step.templateId) {
        errors.push({ field: `steps[${step.id}].templateId`, message: `etapa do tipo "${step.type}" exige "templateId"` });
      }
      if (!stepType.supportsTemplate) {
        errors.push({ field: `steps[${step.id}].type`, message: `tipo "${step.type}" não suporta template — inconsistência de catálogo` });
      }
    }

    if (step.delaySeconds !== undefined) {
      if (step.delaySeconds < 0) {
        errors.push({ field: `steps[${step.id}].delaySeconds`, message: "delaySeconds não pode ser negativo" });
      } else if (!stepType.supportsDelay) {
        errors.push({ field: `steps[${step.id}].delaySeconds`, message: `tipo "${step.type}" não suporta delay` });
      }
    }

    for (const nextId of [...(step.onSuccess ?? []), ...(step.onFailure ?? [])]) {
      if (!stepIds.has(nextId)) {
        errors.push({ field: `steps[${step.id}].onSuccess|onFailure`, message: `referência "${nextId}" não corresponde a nenhuma etapa da cadência` });
      }
    }
  }

  const cycle = detectCircularCadenceSteps(cadence.steps);
  if (cycle) {
    errors.push({ field: "steps", message: `ciclo detectado entre etapas: ${cycle.join(" → ")}` });
  }

  if (!isModuleAuthorized("automation.campaigns", enabledModuleIds, deploymentPlan)) {
    errors.push({
      field: "status",
      message: 'cadência exige o módulo "automation.campaigns", não autorizado nesta instalação (status "planned" — nunca autorizado em produção nesta Foundation)',
    });
  }

  return errors;
}

export type ValidateOutreachCampaignInput = {
  campaign: OutreachCampaign;
  campaignTypeId: string;
  enabledModuleIds: string[];
  deploymentPlan: string;
};

export function validateCampaign(input: ValidateOutreachCampaignInput): OutreachValidationError[] {
  const { campaign, campaignTypeId, enabledModuleIds, deploymentPlan } = input;
  const errors: OutreachValidationError[] = [];

  if (campaign.name.trim().length === 0) {
    errors.push({ field: "name", message: "nome da campanha não pode ser vazio" });
  }
  if (!campaign.segmentId) {
    errors.push({ field: "segmentId", message: "campanha precisa referenciar um segmento" });
  }
  if (!campaign.cadenceId) {
    errors.push({ field: "cadenceId", message: "campanha precisa referenciar uma cadência" });
  }

  const campaignType = getOutreachCampaignTypeDefinition(campaignTypeId);
  if (!campaignType) {
    errors.push({ field: "campaignTypeId", message: `tipo de campanha "${campaignTypeId}" não existe no catálogo` });
    return errors;
  }
  if (campaignType.channel !== campaign.channel) {
    errors.push({ field: "channel", message: `canal "${campaign.channel}" não corresponde ao tipo de campanha "${campaignTypeId}" (esperado "${campaignType.channel}")` });
  }
  for (const moduleId of campaignType.requiredModules) {
    if (!isModuleAuthorized(moduleId, enabledModuleIds, deploymentPlan)) {
      errors.push({ field: "campaignTypeId", message: `campanha exige o módulo "${moduleId}", não autorizado nesta instalação` });
    }
  }

  return errors;
}
