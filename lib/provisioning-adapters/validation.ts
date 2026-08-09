/**
 * Validação da Provisioning Adapters Foundation — v1. Função pura: nunca
 * lança, sempre devolve lista de erros/blockers pro chamador decidir.
 */
import { PROVISIONING_ADAPTER_CAPABILITY_CATALOG } from "./capabilities";
import { PROVISIONING_PROVIDERS } from "./types";
import type { ProvisioningAdapterCapability, ProvisioningAdapterRequest } from "./types";

export type AdapterRequestValidationResult = { valid: boolean; errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateAdapterRequest(request: ProvisioningAdapterRequest): AdapterRequestValidationResult {
  const errors: string[] = [];

  if (!request.installationId) errors.push("installationId ausente");
  if (!request.tenantId) errors.push("tenantId ausente");
  if (!request.stepId) errors.push("stepId ausente");
  if (!(PROVISIONING_PROVIDERS as string[]).includes(request.provider)) {
    errors.push(`provider "${request.provider}" desconhecido`);
  }
  if (!request.operation) errors.push("operation ausente");
  if (request.mode !== "dry_run" && request.mode !== "simulation") {
    errors.push(`mode "${request.mode}" inválido — só "dry_run"/"simulation" nesta Foundation`);
  }
  if (!isPlainObject(request.input)) errors.push("input precisa ser um objeto");
  if (!request.idempotencyKey) errors.push("idempotencyKey ausente");
  if (!request.requestedAt) errors.push("requestedAt ausente");

  return { valid: errors.length === 0, errors };
}

/**
 * Confere invariantes do próprio catálogo de capabilities — nunca deveria
 * disparar em produção (mesmo espírito de `validateStepCatalog` em
 * `lib/provisioning/validation.ts`). Cobre a regra de segurança "nenhum
 * adapter real deve registrar `realExecutionAvailable=true`" nesta Foundation.
 */
export function validateCapabilityCatalog(
  catalog: ProvisioningAdapterCapability[] = PROVISIONING_ADAPTER_CAPABILITY_CATALOG,
): string[] {
  const blockers: string[] = [];
  const seenIds = new Set<string>();

  for (const capability of catalog) {
    if (seenIds.has(capability.id)) {
      blockers.push(`capability duplicada no catálogo: "${capability.id}"`);
    }
    seenIds.add(capability.id);

    if (capability.realExecutionAvailable) {
      blockers.push(`capability "${capability.id}" declara realExecutionAvailable=true — proibido nesta Foundation`);
    }
    if (!(PROVISIONING_PROVIDERS as string[]).includes(capability.provider)) {
      blockers.push(`capability "${capability.id}" referencia provider desconhecido "${capability.provider}"`);
    }
  }

  return blockers;
}
