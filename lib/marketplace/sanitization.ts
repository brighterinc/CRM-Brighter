/**
 * Sanitização da Marketplace / Module Licensing Foundation — v1.
 *
 * NÃO reimplementa a regex de chaves sensíveis: reusa `sanitizeDeep`
 * (`lib/tenants/export.ts`), a MESMA função que `lib/billing/`,
 * `lib/monitoring/`, `lib/automation-engine/` e `lib/outreach/` já reusam
 * (CLAUDE.md anti-pattern #2 — duplicação sem source of truth declarado).
 */
import { sanitizeDeep } from "@/lib/tenants/export";

import type { MarketplaceOffer, ModuleActivationPlan, ModuleLicenseHistoryEntry } from "./types";

export { sanitizeDeep };

export function sanitizeMarketplaceOffer(offer: MarketplaceOffer): MarketplaceOffer {
  return { ...offer, metadata: sanitizeDeep(offer.metadata) as Record<string, unknown> };
}

export function sanitizeHistoryEntry(entry: ModuleLicenseHistoryEntry): ModuleLicenseHistoryEntry {
  return entry.metadata ? { ...entry, metadata: sanitizeDeep(entry.metadata) as Record<string, unknown> } : entry;
}

export function sanitizeActivationPlanForExport(plan: ModuleActivationPlan): ModuleActivationPlan {
  return sanitizeDeep(plan) as ModuleActivationPlan;
}

export function sanitizeMarketplaceLogPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return sanitizeDeep(payload) as Record<string, unknown>;
}
