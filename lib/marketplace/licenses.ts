/**
 * Máquina de estados de `ModuleLicense` — Foundation v1. Nunca altera
 * `ENABLED_MODULES`/`DISABLED_MODULES`, nunca ativa módulo real; toda
 * transição só produz um novo objeto `ModuleLicense` em memória. Transições
 * inválidas lançam `MarketplaceInvalidTransitionError` (`status.ts`) — nunca
 * silenciosamente ignoradas.
 */
import { isLicenseTransitionValid, MarketplaceInvalidTransitionError } from "./status";
import type { LicenseSource, LicenseStatus, ModuleLicense, ModuleTrial } from "./types";

export type CreateLicenseInput = {
  id: string;
  tenantId: string;
  installationId: string;
  moduleId: string;
  source: LicenseSource;
  offerId?: string;
  bundleId?: string;
  billingSubscriptionId?: string;
  billingItemId?: string;
  version?: string;
  now?: string;
};

export function createLicense(input: CreateLicenseInput): ModuleLicense {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    tenantId: input.tenantId,
    installationId: input.installationId,
    moduleId: input.moduleId,
    status: "draft",
    source: input.source,
    offerId: input.offerId,
    bundleId: input.bundleId,
    billingSubscriptionId: input.billingSubscriptionId,
    billingItemId: input.billingItemId,
    startsAt: now,
    version: input.version,
    createdAt: now,
    updatedAt: now,
  };
}

function transition(license: ModuleLicense, to: LicenseStatus, patch: Partial<ModuleLicense> = {}, now?: string): ModuleLicense {
  if (!isLicenseTransitionValid(license.status, to)) {
    throw new MarketplaceInvalidTransitionError("license", license.status, to);
  }
  return { ...license, ...patch, status: to, updatedAt: now ?? new Date().toISOString() };
}

export function activateLicense(license: ModuleLicense, now?: string): ModuleLicense {
  return transition(license, "active", {}, now);
}

/** Licença suspensa NUNCA remove dado — só muda estado (ver CLAUDE.md/spec §7). */
export function suspendLicense(license: ModuleLicense, now?: string): ModuleLicense {
  return transition(license, "suspended", {}, now);
}

export function startLicenseGracePeriod(license: ModuleLicense, gracePeriodEndsAt: string, now?: string): ModuleLicense {
  return transition(license, "grace_period", { gracePeriodEndsAt }, now);
}

export function expireLicense(license: ModuleLicense, now?: string): ModuleLicense {
  const at = now ?? new Date().toISOString();
  return transition(license, "expired", { endsAt: at }, now);
}

export function cancelLicense(license: ModuleLicense, now?: string): ModuleLicense {
  const at = now ?? new Date().toISOString();
  return transition(license, "cancelled", { endsAt: at }, now);
}

export function revokeLicense(license: ModuleLicense, now?: string): ModuleLicense {
  const at = now ?? new Date().toISOString();
  return transition(license, "revoked", { endsAt: at }, now);
}

/** Renovação = volta pra `active` a partir de `expired`/`grace_period`/`suspended`, com novo `endsAt`. */
export function renewLicense(license: ModuleLicense, newEndsAt: string | undefined, now?: string): ModuleLicense {
  return transition(license, "active", { endsAt: newEndsAt, gracePeriodEndsAt: undefined }, now);
}

export function changeLicenseVersion(license: ModuleLicense, newVersion: string, now?: string): ModuleLicense {
  return { ...license, version: newVersion, updatedAt: now ?? new Date().toISOString() };
}

/** Converte um `ModuleTrial` `active` numa `ModuleLicense` `active` — nunca cobra, nunca chama Billing real. */
export function convertTrialToLicense(trial: ModuleTrial, licenseId: string, now?: string): ModuleLicense {
  const at = now ?? new Date().toISOString();
  return {
    id: licenseId,
    tenantId: trial.tenantId,
    installationId: trial.installationId,
    moduleId: trial.moduleId,
    status: "active",
    source: "trial",
    startsAt: at,
    trialEndsAt: trial.endsAt,
    createdAt: at,
    updatedAt: at,
  };
}
