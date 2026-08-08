/**
 * Tabelas de transição de estado da Marketplace / Module Licensing
 * Foundation — v1. Cada `*_TRANSITIONS` é a fonte única de verdade de
 * "quais transições são válidas" — `licenses.ts`/`trials.ts`/`offers.ts`
 * consultam estas tabelas, nunca reimplementam a checagem inline (mesma
 * doutrina de `lib/outreach/status.ts`).
 */
import type { LicenseStatus, MarketplaceOfferStatus, TrialStatus } from "./types";

export const LICENSE_TRANSITIONS: Record<LicenseStatus, LicenseStatus[]> = {
  draft: ["trial", "active", "cancelled"],
  trial: ["active", "expired", "cancelled"],
  active: ["grace_period", "suspended", "cancelled", "expired", "revoked"],
  grace_period: ["active", "suspended", "expired", "cancelled"],
  suspended: ["active", "grace_period", "cancelled", "expired", "revoked"],
  expired: ["active"],
  cancelled: [],
  revoked: [],
};

export const TRIAL_TRANSITIONS: Record<TrialStatus, TrialStatus[]> = {
  scheduled: ["active", "cancelled"],
  active: ["expired", "converted", "cancelled"],
  expired: [],
  converted: [],
  cancelled: [],
};

export const OFFER_TRANSITIONS: Record<MarketplaceOfferStatus, MarketplaceOfferStatus[]> = {
  draft: ["active", "archived"],
  active: ["disabled", "archived"],
  disabled: ["active", "archived"],
  archived: [],
};

/** Estados terminais — uma vez alcançados, nenhuma transição sai deles (usado por validação/resumo). */
export const TERMINAL_LICENSE_STATUSES = new Set<LicenseStatus>(["cancelled", "revoked"]);
export const TERMINAL_TRIAL_STATUSES = new Set<TrialStatus>(["expired", "converted", "cancelled"]);
export const TERMINAL_OFFER_STATUSES = new Set<MarketplaceOfferStatus>(["archived"]);

/**
 * `from === to` só é válido quando `from` NÃO é terminal — senão reinvocar a
 * mesma ação sobre um estado terminal (ex.: cancelar uma licença já
 * `cancelled`) passaria por engano.
 */
function buildTransitionChecker<T extends string>(table: Record<T, T[]>, terminal: Set<T>) {
  return (from: T, to: T): boolean => (from === to && !terminal.has(from)) || table[from].includes(to);
}

export const isLicenseTransitionValid = buildTransitionChecker(LICENSE_TRANSITIONS, TERMINAL_LICENSE_STATUSES);
export const isTrialTransitionValid = buildTransitionChecker(TRIAL_TRANSITIONS, TERMINAL_TRIAL_STATUSES);
export const isOfferTransitionValid = buildTransitionChecker(OFFER_TRANSITIONS, TERMINAL_OFFER_STATUSES);

export class MarketplaceInvalidTransitionError extends Error {
  constructor(
    public readonly entity: "license" | "trial" | "offer",
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`marketplace_invalid_transition: ${entity} "${from}" -> "${to}"`);
    this.name = "MarketplaceInvalidTransitionError";
  }
}
