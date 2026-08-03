/**
 * Validação pura da Control Plane. Cada função devolve
 * `InstallationValidationError[]` (nunca lança, nunca mensagem genérica
 * solta) — mesmo padrão de `lib/tenants/validation.ts`, que este arquivo
 * REUSA (`validateTenantInput`) em vez de reimplementar. Reusa também
 * `validateSlug`/`validateClientName`/`validatePlan`/`isKnownModuleId`
 * (`lib/deployment/validation.ts`).
 */
import { z } from "zod";

import { isKnownModuleId, validateClientName, validatePlan, validateSlug } from "@/lib/deployment/validation";
// Import direto do submódulo (nunca o barrel `@/lib/tenants`) — o barrel
// reexporta `current-installation.ts`, que lê `process.env` via `lib/env.ts`
// e lança se as env vars do Supabase não estiverem configuradas. Mesmo
// cuidado que `lib/provisioning/validation.ts` já toma.
import { validateTenantInput } from "@/lib/tenants/validation";

import { isCommercialStatus, isInstallationStatus, isTechnicalStatus } from "./status";
import type { Installation, InstallationValidationError } from "./types";

const isoDateSchema = z.string().datetime();

function fromMessages(field: string, messages: string[]): InstallationValidationError[] {
  return messages.map((message) => ({ field, message }));
}

/**
 * Valida uma `Installation` completa (create já resolvido, ou update com o
 * patch mergeado por cima da existente). Confere:
 * - campos próprios (id, slug, company, status/commercial/technical, datas);
 * - o `tenant` embutido, via `validateTenantInput` — nunca reimplementado;
 * - que `deployment`/`branding`/`modules`/`deploymentPlan` NÃO divergem do
 *   `tenant` embutido — são campos derivados, não uma segunda fonte de
 *   verdade (ver doutrina em `types.ts`).
 */
export function validateInstallationInput(input: Partial<Installation>): InstallationValidationError[] {
  const errors: InstallationValidationError[] = [];

  const uuidSchema = z.string().uuid();
  if (!input.id || !uuidSchema.safeParse(input.id).success) {
    errors.push({ field: "id", message: `id inválido — esperado UUID v4, recebido "${input.id ?? ""}"` });
  }

  errors.push(...fromMessages("slug", validateSlug(input.slug ?? "")));
  errors.push(...fromMessages("company", validateClientName(input.company ?? "")));
  errors.push(...fromMessages("deploymentPlan", validatePlan(input.deploymentPlan ?? "")));

  if (!input.status || !isInstallationStatus(input.status)) {
    errors.push({ field: "status", message: `status inválido: "${input.status ?? ""}"` });
  }
  if (!input.commercial || !isCommercialStatus(input.commercial)) {
    errors.push({ field: "commercial", message: `commercial inválido: "${input.commercial ?? ""}"` });
  }
  if (!input.technical || !isTechnicalStatus(input.technical)) {
    errors.push({ field: "technical", message: `technical inválido: "${input.technical ?? ""}"` });
  }

  if (!input.tenant) {
    errors.push({ field: "tenant", message: "tenant está ausente" });
  } else {
    const tenantErrors = validateTenantInput(input.tenant);
    errors.push(...tenantErrors.map((e) => ({ field: `tenant.${e.field}`, message: e.message })));

    if (!input.tenant.manifest) {
      errors.push({ field: "tenant.manifest", message: "tenant.manifest está ausente — não há o que derivar" });
    } else {
      if (!input.deployment) {
        errors.push({ field: "deployment", message: "deployment está ausente" });
      } else if (input.deployment !== input.tenant.manifest) {
        errors.push({
          field: "deployment",
          message: "deployment diverge de tenant.manifest — deve ser sempre a mesma referência derivada",
        });
      }
    }

    if (!input.branding) {
      errors.push({ field: "branding", message: "branding está ausente" });
    } else if (input.branding !== input.tenant.branding) {
      errors.push({
        field: "branding",
        message: "branding diverge de tenant.branding — deve ser sempre a mesma referência derivada",
      });
    }

    if (!input.modules) {
      errors.push({ field: "modules", message: "modules está ausente" });
    } else {
      const tenantModules = new Set(input.tenant.enabledModules);
      const sameModules =
        input.modules.length === tenantModules.size && input.modules.every((id) => tenantModules.has(id));
      if (!sameModules) {
        errors.push({
          field: "modules",
          message: "modules diverge de tenant.enabledModules — deve ser sempre derivado, nunca uma lista solta",
        });
      }
      for (const moduleId of input.modules) {
        if (!isKnownModuleId(moduleId)) {
          errors.push({ field: "modules", message: `módulo desconhecido no catálogo: "${moduleId}"` });
        }
      }
    }

    if (input.deploymentPlan && input.tenant.plan && input.deploymentPlan !== input.tenant.plan) {
      errors.push({
        field: "deploymentPlan",
        message: `deploymentPlan ("${input.deploymentPlan}") diverge de tenant.plan ("${input.tenant.plan}")`,
      });
    }
  }

  if (!input.provisioning) {
    errors.push({ field: "provisioning", message: "provisioning está ausente" });
  }

  if (!input.createdAt || !isoDateSchema.safeParse(input.createdAt).success) {
    errors.push({
      field: "createdAt",
      message: `createdAt inválido — esperado ISO-8601 UTC, recebido "${input.createdAt ?? ""}"`,
    });
  }
  if (!input.updatedAt || !isoDateSchema.safeParse(input.updatedAt).success) {
    errors.push({
      field: "updatedAt",
      message: `updatedAt inválido — esperado ISO-8601 UTC, recebido "${input.updatedAt ?? ""}"`,
    });
  }

  return errors;
}
