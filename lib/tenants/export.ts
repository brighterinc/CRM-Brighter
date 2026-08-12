/**
 * Export seguro do Brighter Tenant Engine — `exportTenantSafe(tenant)` monta
 * um JSON pra auditoria/suporte/handoff/documentação e passa por
 * `sanitizeDeep` antes de devolver. Defesa em profundidade: o tipo `Tenant`
 * já não tem campo de segredo (ver `lib/tenants/types.ts`), mas
 * `sanitizeDeep` remove qualquer chave sensível **recursivamente**, mesmo
 * que o objeto de entrada em runtime seja "sujo" — ex. vindo de JSON externo
 * malformado com uma propriedade extra fora do tipo (`serviceRoleKey`,
 * `password`, etc.), que o TypeScript não pega em runtime.
 */
import type { ClientBrandingInput, DeploymentPlan } from "@/lib/deployment";

import { evaluateTenantReadiness } from "./readiness";
import type {
  Tenant,
  TenantCommercialStatus,
  TenantInfrastructureReference,
  TenantReadiness,
  TenantSupabaseReference,
  TenantTechnicalStatus,
} from "./types";

/** Chaves banidas em qualquer profundidade — case-insensitive, casa substring. */
const SENSITIVE_KEY_PATTERN =
  /password|passwd|token|api[_-]?key|secret|service[_-]?role|database[_-]?url|connection[_-]?string|ssh[_-]?key|private[_-]?key/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Remove recursivamente qualquer chave que bata `SENSITIVE_KEY_PATTERN`, em objeto ou array aninhado. Não muta a entrada. */
export function sanitizeDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDeep(item));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) continue;
      result[key] = sanitizeDeep(v);
    }
    return result;
  }
  return value;
}

/**
 * Acha (sem remover) os dot-paths de toda chave que bate `SENSITIVE_KEY_PATTERN`
 * em qualquer profundidade — usado por quem precisa RECUSAR um payload em vez
 * de silenciosamente mascará-lo (ver `assertSafePersistencePayload` em
 * `lib/control-plane-persistence/safe-persistence.ts`). Índice de array vira
 * segmento numérico do path (ex.: `"items.2.token"`).
 */
export function findSensitiveKeyPaths(value: unknown, basePath = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSensitiveKeyPaths(item, basePath ? `${basePath}.${index}` : String(index)));
  }
  if (isPlainObject(value)) {
    const found: string[] = [];
    for (const [key, v] of Object.entries(value)) {
      const path = basePath ? `${basePath}.${key}` : key;
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        found.push(path);
        continue;
      }
      found.push(...findSensitiveKeyPaths(v, path));
    }
    return found;
  }
  return [];
}

export type TenantSafeExport = {
  id: string;
  clientName: string;
  clientSlug: string;
  domain: string;
  plan: DeploymentPlan;
  requestedModules: string[];
  enabledModules: string[];
  branding: ClientBrandingInput;
  commercialStatus: TenantCommercialStatus;
  technicalStatus: TenantTechnicalStatus;
  infrastructure: TenantInfrastructureReference | null;
  supabase: TenantSupabaseReference | null;
  readiness: TenantReadiness;
  /** Só NOMES de env var ainda sem valor público no manifesto — nunca valor. */
  pendingEnvironmentVariables: { required: string[]; optional: string[] } | null;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
};

/**
 * Monta o export seguro de um tenant. Deliberadamente NÃO inclui
 * `primaryContact`/`accountManager` (dado de contato pessoal não faz parte
 * da lista de campos pedida para este export) — quem precisa de contato usa
 * a tela administrativa, não este JSON de handoff.
 */
export function exportTenantSafe(tenant: Tenant): Record<string, unknown> {
  const readiness = evaluateTenantReadiness(tenant);

  const pendingEnvironmentVariables = tenant.manifest
    ? {
        required: tenant.manifest.environment.required.filter(
          (name) => !(name in tenant.manifest!.environment.generatedPublicValues),
        ),
        optional: tenant.manifest.environment.optional.filter(
          (name) => !(name in tenant.manifest!.environment.generatedPublicValues),
        ),
      }
    : null;

  const payload: TenantSafeExport = {
    id: tenant.id,
    clientName: tenant.clientName,
    clientSlug: tenant.clientSlug,
    domain: tenant.domain,
    plan: tenant.plan,
    requestedModules: tenant.requestedModules,
    enabledModules: tenant.enabledModules,
    branding: tenant.branding,
    commercialStatus: tenant.commercialStatus,
    technicalStatus: tenant.technicalStatus,
    infrastructure: tenant.infrastructure ?? null,
    supabase: tenant.supabase ?? null,
    readiness,
    pendingEnvironmentVariables,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    notes: tenant.notes ?? null,
  };

  return sanitizeDeep(payload) as Record<string, unknown>;
}
