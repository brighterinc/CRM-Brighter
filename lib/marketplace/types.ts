/**
 * Tipos centrais da Brighter Marketplace / Module Licensing Foundation — v1.
 *
 * Este módulo NUNCA ativa módulo real, NUNCA cobra, NUNCA persiste de
 * verdade, NUNCA chama rede/Docker/deploy e NUNCA acessa a Lumina. Modela a
 * OFERTA COMERCIAL (catálogo, ofertas, bundles, licenças, trials) e o ESTADO
 * DA LICENÇA de cada módulo por instalação — como domínio puro de simulação
 * determinística, mesmo nível de abstração que Billing/Automation/Outreach.
 *
 * Fronteiras não-negociáveis (nunca duplicar):
 * - `Module Engine` (`lib/modules/catalog.ts::MODULE_CATALOG`) continua
 *   sendo a fonte TÉCNICA única — o que um módulo exige, em que plano roda,
 *   de que depende. `MarketplaceModuleDefinition.moduleId` sempre referencia
 *   uma entrada existente ali; `allowedPlans`/`requiredModules` aqui são
 *   DERIVADOS dela (nunca redeclarados por valor — ver `catalog.ts`).
 * - `Billing Engine` (`lib/billing/`) continua sendo a fonte FINANCEIRA
 *   única — preço, ciclo, assinatura, entitlement financeiro
 *   (`resolveBillingEntitlements`). O Marketplace nunca calcula preço, nunca
 *   cobra, nunca cria invoice; só referencia `billingPlanId`/
 *   `billingSubscriptionId`/`billingItemId` como PONTEIRO.
 * - `LicenseStatus` é um QUINTO eixo de status (mesma doutrina do cabeçalho
 *   de `lib/billing/types.ts`): `ModuleStatus` (técnico, Module Engine),
 *   `SubscriptionStatus` (financeiro, Billing), `InstallationStatus`
 *   (plataforma, Control Plane), `TenantCommercialStatus`/
 *   `TenantTechnicalStatus` (o que o cliente vive, Tenant Engine), e agora
 *   `LicenseStatus` (o estado do DIREITO comercial de uso de UM módulo por
 *   UMA instalação) — nunca os mesmos literais dos outros quatro, embora
 *   todos venham do mesmo domínio de negócio.
 * - O Marketplace NUNCA concede tecnicamente o que o Module Engine já nega
 *   (`allowedPlans`/`dependsOn`/`DISABLED_MODULES`), e NUNCA concede
 *   financeiramente o que o Billing já nega (`resolveBillingEntitlements`).
 *   Ele só CONSOLIDA os dois com o estado da licença/trial/oferta.
 */
import type { DeploymentPlan } from "@/lib/deployment";

// ---------------------------------------------------------------------------
// Vocabulário comercial (distinto do vocabulário técnico do Module Engine)
// ---------------------------------------------------------------------------

/** Quem pode ENXERGAR o módulo no catálogo comercial — nunca confundir com `allowedPlans` (quem pode RODAR). */
export type MarketplaceModuleVisibility = "public" | "private" | "internal" | "hidden";

/**
 * Estado comercial de publicação do módulo no Marketplace — eixo próprio,
 * nunca o mesmo vocabulário de `ModuleStatus` (`lib/modules/catalog.ts`:
 * `"stable" | "beta" | "planned"`, que é TÉCNICO). Um módulo pode ser
 * tecnicamente `"stable"` e comercialmente `"deprecated"` (saindo de venda
 * mas ainda funcionando pra quem já tem).
 */
export type MarketplaceModuleStatus = "draft" | "active" | "beta" | "planned" | "deprecated" | "retired" | "disabled";

export type LicenseStatus =
  | "draft"
  | "trial"
  | "active"
  | "grace_period"
  | "suspended"
  | "expired"
  | "cancelled"
  | "revoked";

export type LicenseSource = "included_in_plan" | "paid_addon" | "trial" | "manual_grant" | "internal" | "bundle";

export type OfferType = "module" | "bundle" | "addon" | "service" | "implementation";

export type TrialStatus = "scheduled" | "active" | "expired" | "converted" | "cancelled";

// ---------------------------------------------------------------------------
// Catálogo comercial
// ---------------------------------------------------------------------------

/**
 * Definição comercial de um módulo — SEMPRE aponta pra uma entrada existente
 * de `MODULE_CATALOG` via `moduleId`. `allowedPlans` é preenchido a partir
 * de `getModuleDefinition(moduleId).allowedPlans` por `buildMarketplaceCatalog()`
 * — nunca escrito à mão num literal deste tipo (ver `catalog.ts`).
 */
export type MarketplaceModuleDefinition = {
  id: string;
  moduleId: string;
  name: string;
  description: string;
  visibility: MarketplaceModuleVisibility;
  status: MarketplaceModuleStatus;
  category: string;
  allowedPlans: DeploymentPlan[];
  requiredModules: string[];
  incompatibleModules?: string[];
  billingReferenceId?: string;
  trialAvailable: boolean;
  trialDurationDays?: number;
  version: string;
  enabled: boolean;
  /** Ids de tenant elegíveis quando `visibility === "private"`. Ignorado nas demais visibilidades. */
  eligibleTenantIds?: string[];
};

export type MarketplaceCatalogIssueSeverity = "blocker" | "warning";

export type MarketplaceCatalogIssue = {
  severity: MarketplaceCatalogIssueSeverity;
  marketplaceModuleId: string;
  moduleId: string;
  code: string;
  message: string;
};

// ---------------------------------------------------------------------------
// Ofertas
// ---------------------------------------------------------------------------

export type MarketplaceOfferStatus = "draft" | "active" | "disabled" | "archived";

export type MarketplaceOffer = {
  id: string;
  name: string;
  description?: string;
  type: OfferType;
  moduleIds: string[];
  deploymentPlans: DeploymentPlan[];
  billingPlanIds?: string[];
  recurring: boolean;
  status: MarketplaceOfferStatus;
  enabled: boolean;
  visibility: MarketplaceModuleVisibility;
  /** Ids de tenant elegíveis quando `visibility === "private"`. */
  eligibleTenantIds?: string[];
  /** ISO-8601 UTC. */
  startsAt?: string;
  /** ISO-8601 UTC. */
  endsAt?: string;
  metadata: Record<string, unknown>;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------

export type MarketplaceBundleModuleRole = "required" | "optional";

export type MarketplaceBundleModule = {
  moduleId: string;
  role: MarketplaceBundleModuleRole;
};

export type MarketplaceBundle = {
  id: string;
  name: string;
  description?: string;
  version: string;
  modules: MarketplaceBundleModule[];
  incompatibleModules?: string[];
  minimumPlan: DeploymentPlan;
  billingReferenceId?: string;
  status: MarketplaceOfferStatus;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
};

export type MarketplaceBundleConflict = {
  bundleId: string;
  moduleId: string;
  conflictsWith: string;
  reason: string;
};

export type MarketplaceBundlePreview = {
  bundleId: string;
  requiredModuleIds: string[];
  optionalModuleIds: string[];
  resolvedModuleIds: string[];
  conflicts: MarketplaceBundleConflict[];
  blockers: string[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Licenças
// ---------------------------------------------------------------------------

export type ModuleLicense = {
  id: string;
  tenantId: string;
  installationId: string;
  moduleId: string;
  status: LicenseStatus;
  source: LicenseSource;
  offerId?: string;
  bundleId?: string;
  billingSubscriptionId?: string;
  billingItemId?: string;
  /** ISO-8601 UTC. */
  startsAt: string;
  /** ISO-8601 UTC. */
  endsAt?: string;
  /** ISO-8601 UTC. */
  trialEndsAt?: string;
  /** ISO-8601 UTC. */
  gracePeriodEndsAt?: string;
  version?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Trials
// ---------------------------------------------------------------------------

export type ModuleTrial = {
  id: string;
  tenantId: string;
  installationId: string;
  moduleId: string;
  status: TrialStatus;
  /** ISO-8601 UTC. */
  startsAt: string;
  /** ISO-8601 UTC. */
  endsAt: string;
  convertedLicenseId?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Elegibilidade e entitlement
// ---------------------------------------------------------------------------

export type MarketplaceRecommendedAction =
  | "none"
  | "start_trial"
  | "purchase_addon"
  | "upgrade_plan"
  | "resolve_dependency"
  | "remove_conflicting_module"
  | "regularize_billing"
  | "contact_sales"
  | "wait_for_module_release";

export type MarketplaceEligibilityResult = {
  moduleId: string;
  eligible: boolean;
  blockers: string[];
  warnings: string[];
  requiredPlan: DeploymentPlan[];
  requiredModules: string[];
  incompatibleModules: string[];
  billingRequirement: string | null;
  trialAvailable: boolean;
  recommendedAction: MarketplaceRecommendedAction;
};

export type MarketplaceEntitlementSource =
  | "included_in_plan"
  | "paid_addon"
  | "trial_active"
  | "bundle"
  | "manual_grant"
  | "internal"
  | "not_licensed"
  | "license_expired"
  | "license_suspended"
  | "license_cancelled"
  | "license_revoked"
  | "trial_expired"
  | "module_planned"
  | "module_retired"
  | "module_disabled_commercially"
  | "blocked_by_module_engine"
  | "blocked_by_billing";

export type MarketplaceModuleEntitlement = {
  moduleId: string;
  authorized: boolean;
  /** `true` quando um módulo `core.*` permanece acessível em modo restrito apesar de licença suspensa/expirada — nunca desaparece pro cliente. */
  restricted: boolean;
  source: MarketplaceEntitlementSource;
  reason: string;
};

export type MarketplaceEntitlementsResult = {
  entitlements: MarketplaceModuleEntitlement[];
  authorizedModules: string[];
  deniedModules: string[];
  trialModules: string[];
  expiredModules: string[];
  suspendedModules: string[];
  includedModules: string[];
  addonModules: string[];
  privateModules: string[];
  warnings: string[];
  blockers: string[];
  reasons: string[];
};

// ---------------------------------------------------------------------------
// Plano de ativação (sempre teórico — nunca executado nesta Foundation)
// ---------------------------------------------------------------------------

export type ModuleActivationDesiredState = "activated" | "deactivated";

export type ModuleActivationPlan = {
  moduleId: string;
  currentState: "enabled" | "disabled";
  desiredState: ModuleActivationDesiredState;
  prerequisites: string[];
  blockers: string[];
  warnings: string[];
  provisioningSteps: string[];
  requiredEnvironmentVariables: string[];
  requiredBillingState: string | null;
  requiresRestart: boolean;
  requiresDeploy: boolean;
  reversible: boolean;
  recommendation: string;
};

// ---------------------------------------------------------------------------
// Versionamento
// ---------------------------------------------------------------------------

export type MarketplaceVersionChangeKind = "upgrade" | "downgrade" | "none";

export type MarketplaceVersionCompatibility = {
  moduleId: string;
  fromVersion: string;
  toVersion: string;
  compatible: boolean;
  changeKind: MarketplaceVersionChangeKind;
  warnings: string[];
  blockers: string[];
};

export type MarketplaceVersionPlan = {
  moduleId: string;
  licenseId: string;
  fromVersion: string;
  toVersion: string;
  changeKind: MarketplaceVersionChangeKind;
  requiresMigration: boolean;
  blockers: string[];
  warnings: string[];
  recommendation: string;
};

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

export type ModuleLicenseHistoryEventType =
  | "license_created"
  | "trial_started"
  | "trial_expired"
  | "trial_converted"
  | "license_activated"
  | "license_suspended"
  | "grace_period_started"
  | "license_renewed"
  | "license_cancelled"
  | "license_revoked"
  | "license_expired"
  | "version_changed"
  | "bundle_attached"
  | "bundle_removed"
  | "entitlement_changed";

export type ModuleLicenseHistoryEntry = {
  id: string;
  tenantId: string;
  installationId: string;
  moduleId: string;
  licenseId?: string;
  trialId?: string;
  type: ModuleLicenseHistoryEventType;
  /** ISO-8601 UTC. */
  occurredAt: string;
  message: string;
  /** Já deve passar por `sanitizeDeep` (`sanitization.ts`) antes de logar/persistir. */
  metadata?: Record<string, unknown>;
};

/** Erro estruturado — nunca mensagem genérica solta. `field` usa dot-path. */
export type MarketplaceValidationError = { field: string; message: string };

export type { DeploymentPlan };
