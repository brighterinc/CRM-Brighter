/**
 * Validação do Real Supabase Adapter — funções puras, nunca lançam, sempre
 * devolvem lista de erros pro chamador decidir (mesmo padrão de
 * `../validation.ts`).
 */
import { findSupabaseRealOperation, isSupabaseRealOperation } from "./supabase-real-operations";
import type { SupabaseRealAdapterRequest } from "./supabase-real-types";

export type SupabaseRealValidationResult = { valid: boolean; errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateSupabaseRealRequest(request: SupabaseRealAdapterRequest): SupabaseRealValidationResult {
  const errors: string[] = [];

  if (!request.installationId) errors.push("installationId ausente");
  if (!request.tenantId) errors.push("tenantId ausente");
  if (!request.operation) errors.push("operation ausente");
  else if (!isSupabaseRealOperation(request.operation)) errors.push(`operation "${request.operation}" desconhecida`);
  if (!isPlainObject(request.input)) errors.push("input precisa ser um objeto");
  if (!request.correlationId) errors.push("correlationId ausente");
  if (!request.requestedAt) errors.push("requestedAt ausente");

  return { valid: errors.length === 0, errors };
}

/** Confere `requiredInputFields` do catálogo contra `request.input` — devolve os campos FALTANTES (lista vazia = ok). */
export function findMissingSupabaseRealInputFields(request: SupabaseRealAdapterRequest): string[] {
  const entry = findSupabaseRealOperation(request.operation);
  if (!entry) return [];
  return entry.requiredInputFields.filter((field) => {
    const value = request.input[field];
    return typeof value !== "string" || value.trim().length === 0;
  });
}
