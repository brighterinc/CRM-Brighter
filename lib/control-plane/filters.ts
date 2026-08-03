/**
 * Filtros puros da Control Plane — sem I/O, sem regra de negócio nova (só
 * comparação de campos já existentes em `Installation`). Usado pelo
 * repositório (`filterInstallations`), pela tela admin e pelo CLI.
 */
import type { CommercialStatus, DeploymentPlan, Installation, InstallationStatus, TechnicalStatus } from "./types";

export type InstallationFilter = {
  plan?: DeploymentPlan;
  status?: InstallationStatus;
  commercial?: CommercialStatus;
  technical?: TechnicalStatus;
  /** Substring, case-insensitive, contra `tenant.domain`. */
  domain?: string;
  /** Substring, case-insensitive, contra `company`. */
  company?: string;
  /** Precisa estar em `modules`. */
  module?: string;
  /** Substring, case-insensitive, contra `branding.appName`. */
  brand?: string;
  /** ISO-8601 — instalações criadas em ou após esta data. */
  createdAfter?: string;
  /** ISO-8601 — instalações criadas em ou antes desta data. */
  createdBefore?: string;
};

function includesCaseInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** Confere um único filtro contra uma única instalação — usado por `applyInstallationFilters`. */
export function matchesInstallationFilter(installation: Installation, filter: InstallationFilter): boolean {
  if (filter.plan && installation.deploymentPlan !== filter.plan) return false;
  if (filter.status && installation.status !== filter.status) return false;
  if (filter.commercial && installation.commercial !== filter.commercial) return false;
  if (filter.technical && installation.technical !== filter.technical) return false;
  if (filter.domain && !includesCaseInsensitive(installation.tenant.domain, filter.domain)) return false;
  if (filter.company && !includesCaseInsensitive(installation.company, filter.company)) return false;
  if (filter.module && !installation.modules.includes(filter.module)) return false;
  if (filter.brand && !includesCaseInsensitive(installation.branding.appName, filter.brand)) return false;
  if (filter.createdAfter && installation.createdAt < filter.createdAfter) return false;
  if (filter.createdBefore && installation.createdAt > filter.createdBefore) return false;
  return true;
}

export function applyInstallationFilters(installations: Installation[], filter: InstallationFilter): Installation[] {
  return installations.filter((installation) => matchesInstallationFilter(installation, filter));
}
