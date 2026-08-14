/**
 * Chave de idempotência do Real Supabase Adapter — hash estável de
 * `{ provider: "supabase", tenantId, installationId, operation,
 * sanitizedInput, planFingerprint? }`. NUNCA inclui valor de credencial (só
 * `input` já sanitizado por `sanitizeDeep` antes de chegar aqui).
 *
 * `stableStringify` ordena as chaves recursivamente — sem isso, dois objetos
 * com o mesmo conteúdo mas ordem de inserção diferente gerariam chaves
 * diferentes, quebrando a detecção de duplicata.
 */
import { createHash } from "node:crypto";

import { sanitizeDeep } from "@/lib/tenants/export";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildSupabaseRealIdempotencyKey(params: {
  tenantId: string;
  installationId: string;
  operation: string;
  input: Record<string, unknown>;
  planFingerprint?: string;
}): string {
  const sanitizedInput = sanitizeDeep(params.input);
  const payload = stableStringify({
    provider: "supabase",
    tenantId: params.tenantId,
    installationId: params.installationId,
    operation: params.operation,
    input: sanitizedInput,
    planFingerprint: params.planFingerprint ?? null,
  });
  return createHash("sha256").update(payload).digest("hex");
}
