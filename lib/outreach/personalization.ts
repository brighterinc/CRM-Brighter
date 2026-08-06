/**
 * Personalização — Outreach & AI Cadence Engine, Foundation v1.
 *
 * `personalizeOutreachContent` só substitui variáveis CONHECIDAS
 * (`templates.ts::extractTemplateVariables` + doutrina "nunca dot-path
 * livre"). Variável sem valor disponível vira o fallback do template (se
 * houver) ou permanece literal — nunca lança, nunca chama IA/rede.
 */
import { detectMissingVariables, extractTemplateVariables } from "./templates";
import type { OutreachPersonalizationContext, OutreachTemplate } from "./types";

function resolveVariableValue(name: string, ctx: OutreachPersonalizationContext): string | undefined {
  const contact = ctx.contact;
  switch (name) {
    case "first_name":
      return contact.name?.split(" ")[0];
    case "full_name":
      return contact.name ?? undefined;
    case "company_name":
      return typeof contact.customFields.company_name === "string" ? contact.customFields.company_name : undefined;
    case "owner_name":
      return ctx.ownerName;
    case "campaign_name":
      return ctx.campaignName;
    default:
      if (name.startsWith("custom.")) {
        const key = name.slice("custom.".length);
        return ctx.customFields?.[key];
      }
      return undefined;
  }
}

export function buildAvailableValues(body: string, ctx: OutreachPersonalizationContext): Record<string, string | undefined> {
  const variables = extractTemplateVariables(body);
  return Object.fromEntries(variables.map((name) => [name, resolveVariableValue(name, ctx)]));
}

export type PersonalizeOutreachContentResult = {
  content: string;
  usedFallback: boolean;
  missingVariables: string[];
};

/** Substitui `{{variavel}}` pelo valor resolvido; se faltar valor, usa `template.fallbackBody` inteiro (nunca substituição parcial silenciosa) — se não houver fallback, deixa o placeholder literal e reporta em `missingVariables`. */
export function personalizeOutreachContent(template: OutreachTemplate, ctx: OutreachPersonalizationContext): PersonalizeOutreachContentResult {
  const values = buildAvailableValues(template.body, ctx);
  const missing = detectMissingVariables(template.body, values);

  if (missing.length > 0 && template.fallbackBody) {
    return { content: template.fallbackBody, usedFallback: true, missingVariables: missing };
  }

  const content = template.body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, name: string) => values[name] ?? match);
  return { content, usedFallback: false, missingVariables: missing };
}

export function generateTemplatePreview(template: OutreachTemplate, ctx: OutreachPersonalizationContext): string {
  return personalizeOutreachContent(template, ctx).content;
}
