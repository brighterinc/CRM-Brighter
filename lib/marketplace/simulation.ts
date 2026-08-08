/**
 * Simulação determinística — spec §16. `simulateMarketplaceScenario` é o
 * dry-run pedido — NUNCA ativa módulo real, NUNCA cobra, NUNCA persiste.
 * Cada cenário é NOMEADO e determinístico (nunca `Math.random`/`Date.now()`
 * implícito) — mesmo espírito de `simulateOutreachScenario`/
 * `simulateBillingScenario`.
 */
import { createDemoInstallations } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";
import { getModuleDefinition } from "@/lib/modules/catalog";

import { buildMarketplaceCatalog, resolveMarketplaceModule } from "./catalog";
import { createDemoBundles } from "./bundles";
import { evaluateOfferAvailability } from "./offers";
import { generateBundlePreview } from "./bundles";
import { resolveMarketplaceEntitlements } from "./entitlements";
import { evaluateModuleEligibility } from "./eligibility";
import { generateModuleActivationPlan } from "./activation";
import { billingAuthorizationForModule, resolveMarketplaceBillingEntitlements } from "./integrations";
import { activateLicense, cancelLicense, convertTrialToLicense, createLicense, expireLicense, startLicenseGracePeriod, suspendLicense } from "./licenses";
import { convertTrial, createTrial, expireTrial, startTrial } from "./trials";
import { planVersionDowngrade, planVersionUpgrade } from "./versioning";
import type {
  MarketplaceBundle,
  MarketplaceBundlePreview,
  MarketplaceEligibilityResult,
  MarketplaceEntitlementsResult,
  MarketplaceModuleDefinition,
  MarketplaceOffer,
  MarketplaceVersionPlan,
  ModuleActivationPlan,
  ModuleLicense,
  ModuleTrial,
} from "./types";

export type MarketplaceSimulationScenario =
  | "included-module"
  | "paid-addon"
  | "active-license"
  | "suspended-license"
  | "expired-license"
  | "cancelled-license"
  | "active-trial"
  | "expired-trial"
  | "trial-converted"
  | "incompatible-plan"
  | "missing-dependency"
  | "conflicting-module"
  | "module-planned"
  | "module-deprecated"
  | "module-retired"
  | "module-disabled"
  | "billing-denied"
  | "billing-active"
  | "private-offer"
  | "bundle-valid"
  | "bundle-conflict"
  | "version-upgrade"
  | "version-downgrade"
  | "grace-period"
  | "activation-ready"
  | "activation-blocked";

export const MARKETPLACE_SIMULATION_SCENARIOS: MarketplaceSimulationScenario[] = [
  "included-module",
  "paid-addon",
  "active-license",
  "suspended-license",
  "expired-license",
  "cancelled-license",
  "active-trial",
  "expired-trial",
  "trial-converted",
  "incompatible-plan",
  "missing-dependency",
  "conflicting-module",
  "module-planned",
  "module-deprecated",
  "module-retired",
  "module-disabled",
  "billing-denied",
  "billing-active",
  "private-offer",
  "bundle-valid",
  "bundle-conflict",
  "version-upgrade",
  "version-downgrade",
  "grace-period",
  "activation-ready",
  "activation-blocked",
];

const NOW = "2026-08-06T12:00:00.000Z";

const DEMO_BILLING_PLAN = {
  id: "demo-plan",
  name: "Plano de demonstração",
  description: "Plano sintético usado só em simulação.",
  deploymentPlan: "dedicated" as const,
  allowedCycles: ["monthly" as const],
  basePrice: { amountCents: 0, currency: "BRL" as const },
  includedModules: ["core.crm", "core.contacts", "channel.email", "compliance.lgpd", "ai.memory", "automation.followups"],
  optionalModules: ["channel.whatsapp", "ai.agents", "integration.nuvemshop"],
  limits: {},
  gracePeriodDays: 7,
  upgradeTo: [],
  downgradeTo: [],
  enabled: true,
};

function buildDemoSubscription(installationId: string, status: "active" | "suspended", purchasedModuleIds: string[]) {
  return {
    id: "demo-subscription",
    tenantId: installationId,
    installationId,
    planId: DEMO_BILLING_PLAN.id,
    cycle: "monthly" as const,
    status,
    startedAt: NOW,
    currentPeriodStart: NOW,
    currentPeriodEnd: NOW,
    cancelAtPeriodEnd: false,
    items: purchasedModuleIds.map((moduleId, index) => ({
      id: `item-${index}`,
      type: "module" as const,
      referenceId: moduleId,
      description: moduleId,
      quantity: 1,
      unitPrice: { amountCents: 0, currency: "BRL" as const },
      recurring: true,
    })),
    discounts: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

export type MarketplaceSimulationResult = {
  scenario: MarketplaceSimulationScenario;
  installation: Installation;
  moduleId: string;
  catalog: MarketplaceModuleDefinition[];
  marketplaceModule: MarketplaceModuleDefinition;
  license?: ModuleLicense;
  trial?: ModuleTrial;
  bundle?: MarketplaceBundle;
  bundlePreview?: MarketplaceBundlePreview;
  offer?: MarketplaceOffer;
  offerAvailable?: boolean;
  eligibility: MarketplaceEligibilityResult;
  entitlements: MarketplaceEntitlementsResult;
  activationPlan: ModuleActivationPlan;
  versionPlan?: MarketplaceVersionPlan;
  blockers: string[];
  warnings: string[];
};

function withOverride(catalog: MarketplaceModuleDefinition[], override: MarketplaceModuleDefinition): MarketplaceModuleDefinition[] {
  return catalog.map((m) => (m.moduleId === override.moduleId ? override : m));
}

/** `simulateMarketplaceScenario` — nunca ativa/cobra/provisiona de verdade. */
export function simulateMarketplaceScenario(
  scenario: MarketplaceSimulationScenario,
  opts: { installation?: Installation } = {},
): MarketplaceSimulationResult {
  // Sempre parte da instalação de demonstração Dedicated — é o único plano em
  // que `channel.whatsapp` (usado por boa parte dos cenários abaixo) é
  // tecnicamente permitido pelo Module Engine (`allowedPlans: ["dedicated"]`);
  // partir de Lite/Pro faria cenários "saudáveis" nascerem com blocker de
  // plano por acidente.
  const demoInstallations = createDemoInstallations();
  const installationBase = opts.installation ?? demoInstallations.find((i) => i.deploymentPlan === "dedicated") ?? demoInstallations[0];
  if (!installationBase) throw new Error("simulate_marketplace_scenario: nenhuma Installation de demonstração disponível");

  let installation = installationBase;
  let catalog = buildMarketplaceCatalog();
  let moduleId = "core.crm";
  let licenseStatus: "active" | "suspended" | "expired" | "cancelled" | "grace_period" | null = null;
  let licenseSource: ModuleLicense["source"] = "included_in_plan";
  let trialStatus: "active" | "expired" | null = null;
  let subscriptionStatus: "active" | "suspended" = "active";
  let purchasedModuleIds: string[] = [];
  let activeLicensedModuleIds: string[] = [];
  const desiredState: "activated" | "deactivated" = "activated";
  let skipBillingForEligibility = false;

  switch (scenario) {
    case "included-module":
      moduleId = "core.crm";
      break;
    case "paid-addon":
      moduleId = "channel.whatsapp";
      licenseStatus = "active";
      licenseSource = "paid_addon";
      purchasedModuleIds = ["channel.whatsapp"];
      break;
    case "active-license":
      moduleId = "ai.agents";
      licenseStatus = "active";
      licenseSource = "paid_addon";
      purchasedModuleIds = ["ai.agents"];
      break;
    case "suspended-license":
      moduleId = "ai.agents";
      licenseStatus = "suspended";
      licenseSource = "paid_addon";
      purchasedModuleIds = ["ai.agents"];
      break;
    case "expired-license":
      moduleId = "ai.agents";
      licenseStatus = "expired";
      licenseSource = "paid_addon";
      purchasedModuleIds = ["ai.agents"];
      break;
    case "cancelled-license":
      moduleId = "ai.agents";
      licenseStatus = "cancelled";
      licenseSource = "paid_addon";
      purchasedModuleIds = ["ai.agents"];
      break;
    case "active-trial":
      // Trial NUNCA passa por Billing (spec §8, "não executar cobrança") — a
      // elegibilidade de um trial é só técnica, nunca financeira.
      moduleId = "channel.whatsapp";
      trialStatus = "active";
      skipBillingForEligibility = true;
      break;
    case "expired-trial":
      moduleId = "channel.whatsapp";
      trialStatus = "expired";
      skipBillingForEligibility = true;
      break;
    case "trial-converted":
      // Licença/trial construídos abaixo via `convertTrialToLicense` de verdade
      // (não pelo bloco genérico) — precisa passar por scheduled -> active -> converted.
      moduleId = "channel.whatsapp";
      skipBillingForEligibility = true;
      break;
    case "incompatible-plan":
      moduleId = "channel.whatsapp";
      installation = { ...installationBase, deploymentPlan: "lite", modules: installationBase.modules.filter((m) => m !== "channel.whatsapp") };
      break;
    case "missing-dependency":
      moduleId = "channel.whatsapp";
      installation = { ...installationBase, modules: installationBase.modules.filter((m) => m !== "core.contacts") };
      break;
    case "conflicting-module": {
      // Comprado (pra isolar o blocker de incompatibilidade do blocker de billing).
      moduleId = "integration.nuvemshop";
      purchasedModuleIds = ["integration.nuvemshop"];
      const base = resolveMarketplaceModule(moduleId, catalog)!;
      catalog = withOverride(catalog, { ...base, incompatibleModules: ["channel.whatsapp"] });
      activeLicensedModuleIds = ["channel.whatsapp"];
      break;
    }
    case "module-planned":
      moduleId = "automation.campaigns";
      break;
    case "module-deprecated": {
      // Comprado (pra isolar o warning de "deprecated" do blocker de billing).
      moduleId = "integration.nuvemshop";
      purchasedModuleIds = ["integration.nuvemshop"];
      const base = resolveMarketplaceModule(moduleId, catalog)!;
      catalog = withOverride(catalog, { ...base, status: "deprecated" });
      break;
    }
    case "module-retired": {
      moduleId = "integration.nuvemshop";
      const base = resolveMarketplaceModule(moduleId, catalog)!;
      catalog = withOverride(catalog, { ...base, status: "retired", enabled: false });
      break;
    }
    case "module-disabled": {
      moduleId = "integration.nuvemshop";
      const base = resolveMarketplaceModule(moduleId, catalog)!;
      catalog = withOverride(catalog, { ...base, status: "disabled", enabled: false });
      break;
    }
    case "billing-denied":
      // Comercialmente autorizado (comprado) mas assinatura suspensa — exercita
      // `blocked_by_subscription_status`, não `optional_extra_not_purchased`.
      moduleId = "ai.agents";
      subscriptionStatus = "suspended";
      purchasedModuleIds = ["ai.agents"];
      break;
    case "billing-active":
      moduleId = "ai.agents";
      purchasedModuleIds = ["ai.agents"];
      licenseStatus = "active";
      licenseSource = "paid_addon";
      break;
    case "private-offer":
      // Comprado (pra isolar o blocker de visibilidade privada do blocker de billing).
      moduleId = "channel.whatsapp";
      purchasedModuleIds = ["channel.whatsapp"];
      break;
    case "bundle-valid":
      moduleId = "core.crm";
      break;
    case "bundle-conflict":
      moduleId = "core.crm";
      break;
    case "version-upgrade":
      moduleId = "channel.whatsapp";
      licenseStatus = "active";
      licenseSource = "paid_addon";
      purchasedModuleIds = ["channel.whatsapp"];
      break;
    case "version-downgrade":
      moduleId = "channel.whatsapp";
      licenseStatus = "active";
      licenseSource = "paid_addon";
      purchasedModuleIds = ["channel.whatsapp"];
      break;
    case "grace-period":
      moduleId = "ai.agents";
      licenseStatus = "grace_period";
      licenseSource = "paid_addon";
      purchasedModuleIds = ["ai.agents"];
      break;
    case "activation-ready":
      moduleId = "automation.followups";
      break;
    case "activation-blocked":
      moduleId = "channel.whatsapp";
      installation = { ...installationBase, modules: installationBase.modules.filter((m) => m !== "core.contacts") };
      break;
  }

  const marketplaceModule = resolveMarketplaceModule(moduleId, catalog);
  if (!marketplaceModule) throw new Error(`simulate_marketplace_scenario: módulo "${moduleId}" ausente do catálogo comercial`);

  // -- licença -----------------------------------------------------------
  let license: ModuleLicense | undefined;
  if (licenseStatus) {
    let l = createLicense({ id: `sim-license-${moduleId}`, tenantId: installation.tenant.id, installationId: installation.id, moduleId, source: licenseSource, version: "1.0.0", now: NOW });
    l = activateLicense(l, NOW);
    if (licenseStatus === "suspended") l = suspendLicense(l, NOW);
    else if (licenseStatus === "grace_period") l = startLicenseGracePeriod(l, "2026-08-13T00:00:00.000Z", NOW);
    else if (licenseStatus === "expired") l = expireLicense(l, NOW);
    else if (licenseStatus === "cancelled") l = cancelLicense(l, NOW);
    license = l;
    activeLicensedModuleIds = [...activeLicensedModuleIds, moduleId];
  }

  // -- trial ---------------------------------------------------------------
  let trial: ModuleTrial | undefined;
  if (trialStatus) {
    let t = createTrial({ id: `sim-trial-${moduleId}`, tenantId: installation.tenant.id, installationId: installation.id, moduleId, startsAt: NOW, durationDays: marketplaceModule.trialDurationDays ?? 14 }, marketplaceModule);
    t = startTrial(t, NOW);
    if (trialStatus === "expired") t = expireTrial(t, NOW);
    trial = t;
  }

  if (scenario === "trial-converted") {
    let t = createTrial({ id: `sim-trial-${moduleId}`, tenantId: installation.tenant.id, installationId: installation.id, moduleId, startsAt: NOW, durationDays: marketplaceModule.trialDurationDays ?? 14 }, marketplaceModule);
    t = startTrial(t, NOW);
    const converted = convertTrialToLicense(t, `sim-license-${moduleId}`, NOW);
    trial = convertTrial(t, converted.id, NOW);
    license = converted;
    activeLicensedModuleIds = [...activeLicensedModuleIds, moduleId];
  }

  // -- billing ---------------------------------------------------------------
  const subscription = buildDemoSubscription(installation.id, subscriptionStatus, purchasedModuleIds);
  const billingResult = resolveMarketplaceBillingEntitlements({
    installation: { deploymentPlan: installation.deploymentPlan, modules: installation.modules },
    subscription,
    billingPlan: DEMO_BILLING_PLAN,
  });
  const billingAuth = billingAuthorizationForModule(moduleId, billingResult);

  // -- elegibilidade / entitlement / ativação ---------------------------------
  const technical = getModuleDefinition(moduleId);
  const eligibility = evaluateModuleEligibility({
    installation: { deploymentPlan: installation.deploymentPlan, enabledModules: installation.modules },
    tenantId: installation.tenant.id,
    marketplaceModule,
    moduleDefinition: technical,
    billing: skipBillingForEligibility ? undefined : billingAuth,
    activeLicensedModuleIds,
  });

  const entitlements = resolveMarketplaceEntitlements({
    installation: { enabledModules: installation.modules },
    catalog,
    licenses: license ? [license] : [],
    trials: trial ? [trial] : [],
    billingAuthorizedModuleIds: billingResult.authorizedModules,
  });

  const activationPlan = generateModuleActivationPlan({
    installation: { deploymentPlan: installation.deploymentPlan, enabledModules: installation.modules },
    marketplaceModule,
    moduleDefinition: technical,
    eligibility,
    desiredState,
  });

  const blockers = [...eligibility.blockers];
  const warnings = [...eligibility.warnings];

  // -- bundle ------------------------------------------------------------
  let bundle: MarketplaceBundle | undefined;
  let bundlePreview: MarketplaceBundlePreview | undefined;
  if (scenario === "bundle-valid") {
    bundle = createDemoBundles().find((b) => b.id === "bundle-crm-essencial");
    if (bundle) bundlePreview = generateBundlePreview(bundle);
  } else if (scenario === "bundle-conflict") {
    const base = createDemoBundles().find((b) => b.id === "bundle-crm-essencial")!;
    bundle = { ...base, id: "bundle-conflicting-demo", incompatibleModules: ["core.crm"] };
    bundlePreview = generateBundlePreview(bundle);
    blockers.push(...bundlePreview.blockers);
  }

  // -- oferta privada ------------------------------------------------------
  let offer: MarketplaceOffer | undefined;
  let offerAvailable: boolean | undefined;
  if (scenario === "private-offer") {
    offer = {
      id: "demo-offer-private-whatsapp",
      name: "WhatsApp — early access",
      type: "addon",
      moduleIds: ["channel.whatsapp"],
      deploymentPlans: ["dedicated"],
      recurring: true,
      status: "active",
      enabled: true,
      visibility: "private",
      eligibleTenantIds: ["outro-tenant-nao-elegivel"],
      metadata: {},
      createdAt: NOW,
      updatedAt: NOW,
    };
    const result = evaluateOfferAvailability(offer, installation.tenant.id, NOW);
    offerAvailable = result.available;
    blockers.push(...result.blockers);
  }

  // -- versionamento -------------------------------------------------------
  let versionPlan: MarketplaceVersionPlan | undefined;
  if (scenario === "version-upgrade" && license) {
    versionPlan = planVersionUpgrade(license, "1.1.0");
    blockers.push(...versionPlan.blockers);
  } else if (scenario === "version-downgrade" && license) {
    const upgraded = { ...license, version: "1.1.0" };
    versionPlan = planVersionDowngrade(upgraded, "1.0.0");
    blockers.push(...versionPlan.blockers);
  }

  return {
    scenario,
    installation,
    moduleId,
    catalog,
    marketplaceModule,
    license,
    trial,
    bundle,
    bundlePreview,
    offer,
    offerAvailable,
    eligibility,
    entitlements,
    activationPlan,
    versionPlan,
    blockers,
    warnings,
  };
}
