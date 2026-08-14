/**
 * Mapeia respostas cruas da Supabase Management API e o catálogo de
 * operações pra shapes seguros de saída — dry-run (`buildSupabaseDryRunOutput`)
 * e real (`mapSupabaseProjectToOutput`). NUNCA retorna campo bruto não
 * listado — allowlist explícita, não denylist (defesa em profundidade além
 * de `sanitizeDeep`, que já roda por cima do resultado final em
 * `supabase-real.ts`).
 */
import { sanitizeDeep } from "@/lib/tenants/export";

import type { SupabaseApiProject } from "./supabase-api";
import type { SupabaseRealOperationCatalogEntry } from "./supabase-real-operations";
import type { SupabaseRealAdapterRequest } from "./supabase-real-types";

export function mapSupabaseProjectToOutput(project: SupabaseApiProject): Record<string, unknown> {
  return sanitizeDeep({
    id: project.id,
    name: project.name,
    region: project.region,
    status: project.status,
    organizationId: project.organization_id,
    createdAt: project.created_at,
  }) as Record<string, unknown>;
}

/**
 * Dry-run NUNCA chama rede — só descreve o que a operação faria. Campos
 * exigidos pela seção "8. DRY RUN" da task: operation, target, required
 * credentials, required inputs, endpoint lógico, blockers, warnings,
 * estimated effects, rollback capability.
 */
export function buildSupabaseDryRunOutput(params: {
  request: SupabaseRealAdapterRequest;
  catalogEntry: SupabaseRealOperationCatalogEntry;
  missingInputFields: string[];
}): Record<string, unknown> {
  const { request, catalogEntry, missingInputFields } = params;
  return sanitizeDeep({
    operation: catalogEntry.operation,
    classification: catalogEntry.classification,
    target: { installationId: request.installationId, tenantId: request.tenantId },
    requiredCredentials: { purpose: catalogEntry.requiredCredentialPurpose, secretType: catalogEntry.requiredSecretType },
    requiredInputFields: catalogEntry.requiredInputFields,
    missingInputFields,
    endpoint: catalogEntry.endpoint,
    estimatedEffects:
      catalogEntry.classification === "real_supported"
        ? "somente leitura — nenhuma mutação no Supabase"
        : catalogEntry.operation === "project.create"
          ? "criaria um projeto Supabase novo (não executado nesta etapa)"
          : "reservado para etapa futura — nenhum efeito nesta etapa",
    rollbackCapability: catalogEntry.supportsRollbackPreview ? "preview disponível" : "não aplicável (operação somente leitura)",
  }) as Record<string, unknown>;
}
