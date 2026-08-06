/**
 * Templates — Outreach & AI Cadence Engine, Foundation v1.
 *
 * Interpolação própria (`{{variavel}}`), deliberadamente NÃO reusando nem
 * colidindo com `lib/inbox/template-vars.ts::interpolateTemplate` (só
 * `{{nome}}`/`{{primeiro_nome}}`, escopo de resposta rápida) nem
 * `lib/automation/template.ts::renderTemplate` (motor legado de automação,
 * dot-path arbitrário) — variáveis fixas e nomeadas (`OutreachTemplateVariable`),
 * nunca dot-path livre nem `eval`/JS fornecido por usuário.
 */
import type { OutreachTemplate, OutreachTemplateVariable } from "./types";

const KNOWN_FIXED_VARIABLES: OutreachTemplateVariable[] = ["first_name", "full_name", "company_name", "owner_name", "campaign_name"];
const SENSITIVE_VARIABLE_PATTERN = /password|token|api[_-]?key|secret|cpf|cnpj|card|cvv|ssh[_-]?key/i;

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function extractTemplateVariables(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (name) found.add(name);
  }
  return Array.from(found);
}

function isKnownVariable(name: string): boolean {
  return (KNOWN_FIXED_VARIABLES as string[]).includes(name) || name.startsWith("custom.");
}

export type ValidateTemplateResult = {
  valid: boolean;
  unknownVariables: string[];
  sensitiveVariables: string[];
  isEmpty: boolean;
};

export function validateTemplate(template: OutreachTemplate): ValidateTemplateResult {
  const isEmpty = template.body.trim().length === 0;
  const variables = extractTemplateVariables(template.body);
  const unknownVariables = variables.filter((v) => !isKnownVariable(v));
  const sensitiveVariables = variables.filter((v) => SENSITIVE_VARIABLE_PATTERN.test(v));

  return {
    valid: !isEmpty && unknownVariables.length === 0 && sensitiveVariables.length === 0,
    unknownVariables,
    sensitiveVariables,
    isEmpty,
  };
}

export function detectMissingVariables(body: string, availableValues: Record<string, string | undefined>): string[] {
  return extractTemplateVariables(body).filter((v) => !availableValues[v]);
}
