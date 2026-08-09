/**
 * Sanitização da Provisioning Adapters Foundation — v1.
 *
 * NÃO reimplementa a regex de chaves sensíveis: reusa `sanitizeDeep`
 * (`lib/tenants/export.ts`), a MESMA função que `lib/billing/`,
 * `lib/monitoring/`, `lib/automation-engine/`, `lib/outreach/` e
 * `lib/marketplace/` já reusam (CLAUDE.md anti-pattern #2).
 */
import { sanitizeDeep } from "@/lib/tenants/export";

import type {
  ProvisioningAdapterRequest,
  ProvisioningAdapterResult,
  ProvisioningRollbackPreview,
} from "./types";

export { sanitizeDeep };

export function sanitizeAdapterInput(input: Record<string, unknown>): Record<string, unknown> {
  return sanitizeDeep(input) as Record<string, unknown>;
}

export function sanitizeAdapterOutput(output: Record<string, unknown>): Record<string, unknown> {
  return sanitizeDeep(output) as Record<string, unknown>;
}

export function sanitizeAdapterRequestForLog(request: ProvisioningAdapterRequest): ProvisioningAdapterRequest {
  return { ...request, input: sanitizeAdapterInput(request.input) };
}

export function sanitizeAdapterResultForLog(result: ProvisioningAdapterResult): ProvisioningAdapterResult {
  return {
    ...result,
    output: sanitizeAdapterOutput(result.output),
    rollbackPreview: result.rollbackPreview ? sanitizeRollbackPreview(result.rollbackPreview) : undefined,
  };
}

export function sanitizeRollbackPreview(preview: ProvisioningRollbackPreview): ProvisioningRollbackPreview {
  return sanitizeDeep(preview) as ProvisioningRollbackPreview;
}

export function sanitizeAdapterSummaryPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return sanitizeDeep(payload) as Record<string, unknown>;
}
