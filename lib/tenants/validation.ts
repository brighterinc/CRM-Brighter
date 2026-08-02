/**
 * Validação estruturada do Brighter Tenant Engine. Cada função devolve
 * `TenantValidationError[]` (nunca lança, nunca mensagem genérica solta) —
 * mesmo padrão de `lib/deployment/validation.ts`, que este arquivo REUSA em
 * vez de reimplementar (`validateClientName`, `validateSlug`,
 * `validateDomain`, `validatePlan`, `validateBranding`, `isKnownModuleId`).
 */
import { z } from "zod";

import type { DeploymentManifest } from "@/lib/deployment";
import {
  isKnownModuleId,
  validateBranding,
  validateClientName,
  validateDomain,
  validatePlan,
  validateSlug,
} from "@/lib/deployment/validation";

import { isTenantCommercialStatus, isTenantTechnicalStatus } from "./status";
import type { Tenant, TenantContact, TenantValidationError } from "./types";

const uuidSchema = z.string().uuid();
const emailSchema = z.string().email();
const isoDateSchema = z.string().datetime();

function fromMessages(field: string, messages: string[]): TenantValidationError[] {
  return messages.map((message) => ({ field, message }));
}

function validateContact(field: string, contact: TenantContact | undefined): TenantValidationError[] {
  if (!contact) return [];
  const errors: TenantValidationError[] = [];
  if (!contact.name || contact.name.trim().length === 0) {
    errors.push({ field: `${field}.name`, message: `${field}.name está vazio` });
  }
  if (!contact.email || !emailSchema.safeParse(contact.email).success) {
    errors.push({ field: `${field}.email`, message: `${field}.email inválido: "${contact.email ?? ""}"` });
  }
  return errors;
}

/**
 * Valida um `Tenant` completo (create já resolvido, ou update com o patch
 * mergeado por cima do existente — nunca um patch parcial isolado). Todo
 * campo obrigatório ausente é erro estruturado, nunca `throw` de string.
 */
export function validateTenantInput(input: Partial<Tenant>): TenantValidationError[] {
  const errors: TenantValidationError[] = [];

  if (!input.id || !uuidSchema.safeParse(input.id).success) {
    errors.push({ field: "id", message: `id inválido — esperado UUID v4, recebido "${input.id ?? ""}"` });
  }

  errors.push(...fromMessages("clientName", validateClientName(input.clientName ?? "")));
  errors.push(...fromMessages("clientSlug", validateSlug(input.clientSlug ?? "")));
  errors.push(...fromMessages("domain", validateDomain(input.domain ?? "")));
  errors.push(...fromMessages("plan", validatePlan(input.plan ?? "")));

  if (!input.branding) {
    errors.push({ field: "branding", message: "branding está ausente" });
  } else {
    // Só os blockers do Deployment Engine (appName vazio) bloqueiam o tenant;
    // e-mail/URL malformados em branding viram warning lá, e a mesma decisão
    // vale aqui — não duplicamos o critério, só o resultado.
    const brandingResult = validateBranding(input.branding);
    errors.push(...fromMessages("branding", brandingResult.blockers));
  }

  if (!input.commercialStatus || !isTenantCommercialStatus(input.commercialStatus)) {
    errors.push({
      field: "commercialStatus",
      message: `commercialStatus inválido: "${input.commercialStatus ?? ""}"`,
    });
  }
  if (!input.technicalStatus || !isTenantTechnicalStatus(input.technicalStatus)) {
    errors.push({
      field: "technicalStatus",
      message: `technicalStatus inválido: "${input.technicalStatus ?? ""}"`,
    });
  }

  for (const moduleId of input.requestedModules ?? []) {
    if (!isKnownModuleId(moduleId)) {
      errors.push({
        field: "requestedModules",
        message: `módulo desconhecido no catálogo: "${moduleId}"`,
      });
    }
  }
  for (const moduleId of input.enabledModules ?? []) {
    if (!isKnownModuleId(moduleId)) {
      errors.push({
        field: "enabledModules",
        message: `módulo desconhecido no catálogo: "${moduleId}"`,
      });
    }
  }

  errors.push(...validateContact("primaryContact", input.primaryContact));
  errors.push(...validateContact("accountManager", input.accountManager));

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

export type AttachManifestResult = { ok: true; tenant: Tenant } | { ok: false; errors: TenantValidationError[] };

/**
 * Associa um `DeploymentManifest` (gerado por `generateDeploymentManifest`,
 * nunca reimplementado aqui) a um tenant, conferindo que o manifesto foi
 * de fato gerado PRA ESTE tenant — slug, domínio, plano, módulos pedidos e
 * o nome de marca essencial (`branding.appName`, ecoado em
 * `manifest.environment.generatedPublicValues.APP_NAME`). Divergência vira
 * erro estruturado por campo; nunca lança.
 */
export function attachDeploymentManifest(tenant: Tenant, manifest: DeploymentManifest): AttachManifestResult {
  const errors: TenantValidationError[] = [];

  if (manifest.client.slug !== tenant.clientSlug) {
    errors.push({
      field: "clientSlug",
      message: `manifesto foi gerado para o slug "${manifest.client.slug}", tenant é "${tenant.clientSlug}"`,
    });
  }
  if (manifest.client.domain !== tenant.domain) {
    errors.push({
      field: "domain",
      message: `manifesto foi gerado para o domínio "${manifest.client.domain}", tenant é "${tenant.domain}"`,
    });
  }
  if (manifest.plan !== tenant.plan) {
    errors.push({
      field: "plan",
      message: `manifesto foi gerado para o plano "${manifest.plan}", tenant é "${tenant.plan}"`,
    });
  }
  if (manifest.client.name !== tenant.clientName) {
    errors.push({
      field: "clientName",
      message: `manifesto foi gerado para o cliente "${manifest.client.name}", tenant é "${tenant.clientName}"`,
    });
  }

  const manifestRequested = new Set(manifest.requestedModules);
  const tenantRequested = new Set(tenant.requestedModules);
  const sameModules =
    manifestRequested.size === tenantRequested.size &&
    [...manifestRequested].every((id) => tenantRequested.has(id));
  if (!sameModules) {
    errors.push({
      field: "requestedModules",
      message: `manifesto foi gerado para os módulos [${manifest.requestedModules.join(", ")}], tenant pediu [${tenant.requestedModules.join(", ")}]`,
    });
  }

  const manifestAppName = manifest.environment.generatedPublicValues.APP_NAME;
  if (manifestAppName !== tenant.branding.appName) {
    errors.push({
      field: "branding.appName",
      message: `manifesto foi gerado com branding.appName "${manifestAppName ?? ""}", tenant tem "${tenant.branding.appName}"`,
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    tenant: {
      ...tenant,
      manifest,
      enabledModules: manifest.enabledModules,
      updatedAt: new Date().toISOString(),
    },
  };
}
