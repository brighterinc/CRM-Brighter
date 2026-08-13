/**
 * Validação estrutural de `ProviderCredentialRequest` — só forma (campos
 * presentes, vocabulário fechado, timestamp parseável). Nunca decide
 * autorização (isso é `policy.ts`) nem toca vault/repository (isso é
 * `resolver.ts`). Roda ANTES de qualquer I/O, mesmo espírito de
 * `assertSafePersistencePayload` rodar antes de qualquer escrita.
 */
import { PROVIDER_CREDENTIAL_PURPOSES, type ProviderCredentialRequest } from "./types";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function validateProviderCredentialRequest(request: ProviderCredentialRequest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!isNonEmptyString(request.tenantId)) errors.push("tenantId é obrigatório");
  if (!isNonEmptyString(request.installationId)) errors.push("installationId é obrigatório");
  if (!isNonEmptyString(request.secretReferenceId)) errors.push("secretReferenceId é obrigatório");
  if (!isNonEmptyString(request.provider)) errors.push("provider é obrigatório");
  if (!isNonEmptyString(request.operation)) errors.push("operation é obrigatório");
  if (!isNonEmptyString(request.correlationId)) errors.push("correlationId é obrigatório");

  if (!isNonEmptyString(request.purpose) || !(PROVIDER_CREDENTIAL_PURPOSES as readonly string[]).includes(request.purpose)) {
    errors.push(`purpose deve ser um de: ${PROVIDER_CREDENTIAL_PURPOSES.join(", ")}`);
  }

  if (!isValidIsoTimestamp(request.requestedAt)) errors.push("requestedAt deve ser um timestamp ISO-8601 válido");

  if (request.requestedBy !== undefined && request.requestedBy !== null && typeof request.requestedBy !== "string") {
    errors.push("requestedBy deve ser string ou null");
  }

  if (request.singleUse !== undefined && typeof request.singleUse !== "boolean") {
    errors.push("singleUse deve ser boolean");
  }

  return { valid: errors.length === 0, errors };
}
