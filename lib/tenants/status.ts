/**
 * Vocabulário de status do Tenant Engine — listas fechadas + rank comercial.
 * Mesmo padrão de `ROLE_RANK` em `lib/auth/types.ts`.
 */
import type { TenantCommercialStatus, TenantTechnicalStatus } from "./types";

export const TENANT_COMMERCIAL_STATUSES: TenantCommercialStatus[] = [
  "lead",
  "proposal",
  "contracted",
  "onboarding",
  "active",
  "suspended",
  "cancelled",
];

export const TENANT_TECHNICAL_STATUSES: TenantTechnicalStatus[] = [
  "draft",
  "configuration_pending",
  "ready_to_provision",
  "provisioning",
  "validation",
  "live",
  "degraded",
  "archived",
];

/**
 * Rank comercial — só existe pro critério de readiness "contrato confirmado"
 * (`commercialStatus` rank ≥ `contracted`). `suspended` herda o rank de
 * `active` (era ativo, só está pausado); `cancelled` fica em 0 (nunca conta
 * como contrato confirmado, mesmo tendo passado por `contracted` no passado).
 */
export const COMMERCIAL_STATUS_RANK: Record<TenantCommercialStatus, number> = {
  lead: 1,
  proposal: 2,
  contracted: 3,
  onboarding: 4,
  active: 5,
  suspended: 5,
  cancelled: 0,
};

export function isTenantCommercialStatus(value: string): value is TenantCommercialStatus {
  return (TENANT_COMMERCIAL_STATUSES as string[]).includes(value);
}

export function isTenantTechnicalStatus(value: string): value is TenantTechnicalStatus {
  return (TENANT_TECHNICAL_STATUSES as string[]).includes(value);
}
