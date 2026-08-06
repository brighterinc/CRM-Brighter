/**
 * Sanitização da Outreach & AI Cadence Engine — Foundation v1.
 *
 * NÃO reimplementa a regex de chaves sensíveis: reusa `sanitizeDeep`
 * (`lib/tenants/export.ts`), a MESMA função que `lib/automation-engine/`,
 * `lib/billing/`, `lib/monitoring/` e `lib/provisioning/logging.ts` já
 * reusam. Existe exatamente UM sanitizador recursivo no repositório —
 * duplicar aqui seria o anti-pattern #2 do CLAUDE.md ("duplicação sem
 * source of truth declarado").
 */
import { sanitizeDeep } from "@/lib/tenants/export";

import type { OutreachEnrollment, OutreachResponse, OutreachSyntheticContact } from "./types";

export { sanitizeDeep };

export function sanitizeOutreachResponse(response: OutreachResponse): OutreachResponse {
  return { ...response, bodySanitized: sanitizeDeep(response.bodySanitized) as string };
}

export function sanitizeSyntheticContact(contact: OutreachSyntheticContact): OutreachSyntheticContact {
  return { ...contact, customFields: sanitizeDeep(contact.customFields) as Record<string, unknown> };
}

export function sanitizeEnrollmentForExport(enrollment: OutreachEnrollment): OutreachEnrollment {
  return sanitizeDeep(enrollment) as OutreachEnrollment;
}

export function sanitizeOutreachLogPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return sanitizeDeep(payload) as Record<string, unknown>;
}
