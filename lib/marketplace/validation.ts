/**
 * Validação estrutural — spec §25 (formas de `ModuleLicense`/`ModuleTrial`/
 * `MarketplaceOffer`). Distinta de `catalog.ts::validateMarketplaceCatalog`
 * (cruza com o Module Engine) e de `eligibility.ts` (regra de negócio sobre
 * SE um módulo pode ser licenciado) — aqui é só forma: datas coerentes,
 * campos obrigatórios, referências não-vazias.
 */
import type { MarketplaceOffer, MarketplaceValidationError, ModuleLicense, ModuleTrial } from "./types";

function isIsoDate(value: string | undefined): boolean {
  if (!value) return true;
  return !Number.isNaN(new Date(value).getTime());
}

export function validateModuleLicense(license: ModuleLicense): MarketplaceValidationError[] {
  const errors: MarketplaceValidationError[] = [];
  if (!license.tenantId.trim()) errors.push({ field: "tenantId", message: "obrigatório" });
  if (!license.installationId.trim()) errors.push({ field: "installationId", message: "obrigatório" });
  if (!license.moduleId.trim()) errors.push({ field: "moduleId", message: "obrigatório" });
  if (!isIsoDate(license.startsAt)) errors.push({ field: "startsAt", message: "data ISO-8601 inválida" });
  if (!isIsoDate(license.endsAt)) errors.push({ field: "endsAt", message: "data ISO-8601 inválida" });
  if (!isIsoDate(license.trialEndsAt)) errors.push({ field: "trialEndsAt", message: "data ISO-8601 inválida" });
  if (!isIsoDate(license.gracePeriodEndsAt)) errors.push({ field: "gracePeriodEndsAt", message: "data ISO-8601 inválida" });
  if (license.endsAt && new Date(license.endsAt).getTime() < new Date(license.startsAt).getTime()) {
    errors.push({ field: "endsAt", message: "não pode ser anterior a startsAt" });
  }
  if (license.source === "paid_addon" && !license.billingSubscriptionId && !license.billingItemId) {
    errors.push({ field: "billingSubscriptionId", message: 'licença "paid_addon" deveria referenciar billingSubscriptionId/billingItemId' });
  }
  if (license.source === "bundle" && !license.bundleId) {
    errors.push({ field: "bundleId", message: 'licença "bundle" deveria referenciar bundleId' });
  }
  return errors;
}

export function validateModuleTrial(trial: ModuleTrial): MarketplaceValidationError[] {
  const errors: MarketplaceValidationError[] = [];
  if (!trial.tenantId.trim()) errors.push({ field: "tenantId", message: "obrigatório" });
  if (!trial.installationId.trim()) errors.push({ field: "installationId", message: "obrigatório" });
  if (!trial.moduleId.trim()) errors.push({ field: "moduleId", message: "obrigatório" });
  if (!isIsoDate(trial.startsAt)) errors.push({ field: "startsAt", message: "data ISO-8601 inválida" });
  if (!isIsoDate(trial.endsAt)) errors.push({ field: "endsAt", message: "data ISO-8601 inválida" });
  if (new Date(trial.endsAt).getTime() <= new Date(trial.startsAt).getTime()) {
    errors.push({ field: "endsAt", message: "deve ser posterior a startsAt" });
  }
  if (trial.status === "converted" && !trial.convertedLicenseId) {
    errors.push({ field: "convertedLicenseId", message: 'trial "converted" precisa referenciar convertedLicenseId' });
  }
  return errors;
}

export function validateMarketplaceOffer(offer: MarketplaceOffer): MarketplaceValidationError[] {
  const errors: MarketplaceValidationError[] = [];
  if (!offer.name.trim()) errors.push({ field: "name", message: "obrigatório" });
  if (offer.moduleIds.length === 0) errors.push({ field: "moduleIds", message: "obrigatório ao menos um módulo" });
  if (offer.deploymentPlans.length === 0) errors.push({ field: "deploymentPlans", message: "obrigatório ao menos um plano" });
  if (!isIsoDate(offer.startsAt)) errors.push({ field: "startsAt", message: "data ISO-8601 inválida" });
  if (!isIsoDate(offer.endsAt)) errors.push({ field: "endsAt", message: "data ISO-8601 inválida" });
  if (offer.startsAt && offer.endsAt && new Date(offer.endsAt).getTime() < new Date(offer.startsAt).getTime()) {
    errors.push({ field: "endsAt", message: "não pode ser anterior a startsAt" });
  }
  if (offer.visibility === "private" && (!offer.eligibleTenantIds || offer.eligibleTenantIds.length === 0)) {
    errors.push({ field: "eligibleTenantIds", message: 'oferta "private" precisa de ao menos um tenant elegível' });
  }
  return errors;
}
