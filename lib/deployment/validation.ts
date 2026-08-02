/**
 * Validação pura do Brighter Deployment Engine. Cada função devolve mensagens
 * de erro (string[]) em vez de lançar — quem monta o manifesto
 * (`lib/deployment/manifest.ts`) decide o que vira `blocker` e o que vira
 * `warning`. Nada aqui lê `process.env`.
 */
import { z } from "zod";

import { DEPLOYMENT_PLANS, MODULE_CATALOG, type DeploymentPlan } from "@/lib/modules/catalog";
import { DEPLOYMENT_PROFILES } from "./profiles";
import type { ClientBrandingInput, DeploymentTarget } from "./types";

const MIN_SLUG_LENGTH = 2;
const MAX_SLUG_LENGTH = 40;

/** Minúsculas/números, hífen simples entre blocos — sem hífen líder/final nem duplo. */
export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
/** Host puro (sem protocolo/porta/caminho), pelo menos um rótulo + TLD. */
export const DOMAIN_REGEX = new RegExp(`^${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})+$`, "i");

const emailSchema = z.string().email();
const urlSchema = z.string().url();

export function validateClientName(clientName: string): string[] {
  if (!clientName || clientName.trim().length === 0) {
    return ["clientName está vazio"];
  }
  return [];
}

export function validateSlug(slug: string): string[] {
  if (!slug || slug.trim().length === 0) {
    return ["clientSlug está vazio"];
  }
  const errors: string[] = [];
  if (slug.length < MIN_SLUG_LENGTH || slug.length > MAX_SLUG_LENGTH) {
    errors.push(`clientSlug deve ter entre ${MIN_SLUG_LENGTH} e ${MAX_SLUG_LENGTH} caracteres`);
  }
  if (!SLUG_REGEX.test(slug)) {
    errors.push(
      "clientSlug inválido — use apenas letras minúsculas, números e hífen simples (ex.: empresa-exemplo)",
    );
  }
  return errors;
}

export function validateDomain(domain: string): string[] {
  if (!domain || domain.trim().length === 0) {
    return ["domain está vazio"];
  }
  const value = domain.trim().toLowerCase();
  if (value.includes("://") || value.includes("/")) {
    return ["domain inválido — informe só o host (ex.: crm.empresa.com.br), sem protocolo ou caminho"];
  }
  if (!DOMAIN_REGEX.test(value)) {
    return ["domain inválido — formato de host esperado (ex.: crm.empresa.com.br)"];
  }
  return [];
}

export function validatePlan(plan: string): string[] {
  if (!(DEPLOYMENT_PLANS as string[]).includes(plan)) {
    return [`plan inválido: "${plan}" — esperado um de ${DEPLOYMENT_PLANS.join(", ")}`];
  }
  return [];
}

export function validateTarget(target: DeploymentTarget, plan: DeploymentPlan): string[] {
  const profile = DEPLOYMENT_PROFILES[plan];
  if (!profile.allowedTargets.includes(target)) {
    return [
      `target "${target}" incompatível com o plano "${plan}" — permitidos: ${profile.allowedTargets.join(", ")}`,
    ];
  }
  return [];
}

export function validateBranding(branding: ClientBrandingInput): {
  blockers: string[];
  warnings: string[];
} {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!branding.appName || branding.appName.trim().length === 0) {
    blockers.push("branding.appName está vazio");
  }

  if (branding.supportEmail && !emailSchema.safeParse(branding.supportEmail).success) {
    warnings.push(`branding.supportEmail malformado: "${branding.supportEmail}"`);
  }
  if (branding.fromEmail && !emailSchema.safeParse(branding.fromEmail).success) {
    warnings.push(`branding.fromEmail malformado: "${branding.fromEmail}"`);
  }
  for (const [field, value] of [
    ["logoUrl", branding.logoUrl],
    ["faviconUrl", branding.faviconUrl],
    ["websiteUrl", branding.websiteUrl],
  ] as const) {
    if (value && !urlSchema.safeParse(value).success) {
      warnings.push(`branding.${field} inválida: "${value}"`);
    }
  }

  return { blockers, warnings };
}

export function isKnownModuleId(moduleId: string): boolean {
  return MODULE_CATALOG.some((m) => m.id === moduleId);
}
