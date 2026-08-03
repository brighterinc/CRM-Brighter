/**
 * Validação estrutural do Billing Engine — Foundation v1. Erros sempre
 * estruturados (`BillingValidationError[]`), nunca `throw` de string solta
 * fora dos erros de classe dedicados (ver `subscriptions.ts`/`repository.ts`).
 */
import { getModuleDefinition } from "@/lib/modules/catalog";

import { getBillingPlanDefinition } from "./catalog";
import type { BillingDiscount, BillingInvoice, BillingPlanDefinition, BillingSubscription, BillingValidationError } from "./types";

export function validateBillingPlanDefinition(plan: BillingPlanDefinition): BillingValidationError[] {
  const errors: BillingValidationError[] = [];

  if (plan.allowedCycles.length === 0) {
    errors.push({ field: "allowedCycles", message: "plano precisa permitir ao menos um ciclo de cobrança" });
  }
  if (plan.basePrice.amountCents < 0) {
    errors.push({ field: "basePrice.amountCents", message: "preço base não pode ser negativo" });
  }
  if (plan.gracePeriodDays < 0) {
    errors.push({ field: "gracePeriodDays", message: "grace period não pode ser negativo" });
  }

  for (const moduleId of [...plan.includedModules, ...plan.optionalModules]) {
    const def = getModuleDefinition(moduleId);
    if (!def) {
      errors.push({ field: "includedModules", message: `módulo "${moduleId}" não existe no Module Engine` });
      continue;
    }
    if (!def.allowedPlans.includes(plan.deploymentPlan)) {
      errors.push({
        field: "includedModules",
        message: `módulo "${moduleId}" não é permitido no plano de implantação "${plan.deploymentPlan}"`,
      });
    }
    if (def.status === "planned") {
      errors.push({ field: "includedModules", message: `módulo "${moduleId}" está "planned" — nunca autorizado em produção` });
    }
  }

  return errors;
}

export function validateBillingDiscount(discount: BillingDiscount): BillingValidationError[] {
  const errors: BillingValidationError[] = [];

  if (discount.type === "percentage" && (discount.value < 0 || discount.value > 100)) {
    errors.push({ field: "value", message: "desconto percentual deve estar entre 0 e 100" });
  }
  if (discount.type === "fixed" && discount.value < 0) {
    errors.push({ field: "value", message: "desconto fixo não pode ser negativo" });
  }
  if (discount.startsAt && discount.endsAt && discount.endsAt < discount.startsAt) {
    errors.push({ field: "endsAt", message: "data de término não pode ser anterior à data de início" });
  }

  return errors;
}

export type ValidateSubscriptionInput = Pick<BillingSubscription, "planId" | "cycle" | "tenantId" | "installationId">;

export function validateBillingSubscriptionInput(input: ValidateSubscriptionInput): BillingValidationError[] {
  const errors: BillingValidationError[] = [];

  if (!input.tenantId) errors.push({ field: "tenantId", message: "tenantId é obrigatório" });
  if (!input.installationId) errors.push({ field: "installationId", message: "installationId é obrigatório" });

  const plan = getBillingPlanDefinition(input.planId);
  if (!plan) {
    errors.push({ field: "planId", message: `plano "${input.planId}" não existe no catálogo` });
  } else {
    if (!plan.enabled) {
      errors.push({ field: "planId", message: `plano "${input.planId}" está desabilitado` });
    }
    if (!plan.allowedCycles.includes(input.cycle)) {
      errors.push({ field: "cycle", message: `ciclo "${input.cycle}" não é permitido no plano "${input.planId}"` });
    }
  }

  return errors;
}

export function validateBillingInvoiceInput(invoice: Pick<BillingInvoice, "subtotal" | "discountTotal" | "total">): BillingValidationError[] {
  const errors: BillingValidationError[] = [];

  if (invoice.total.amountCents < 0) {
    errors.push({ field: "total.amountCents", message: "total não pode ser negativo" });
  }
  if (invoice.discountTotal.amountCents > invoice.subtotal.amountCents) {
    errors.push({ field: "discountTotal.amountCents", message: "desconto não pode ultrapassar o subtotal" });
  }
  if (invoice.subtotal.amountCents - invoice.discountTotal.amountCents !== invoice.total.amountCents) {
    errors.push({ field: "total.amountCents", message: "total deve ser subtotal menos desconto" });
  }

  return errors;
}
