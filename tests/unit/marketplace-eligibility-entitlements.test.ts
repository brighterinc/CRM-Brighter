import { describe, expect, it } from "vitest";

import { evaluateModuleEligibility } from "@/lib/marketplace/eligibility";
import { resolveMarketplaceEntitlements } from "@/lib/marketplace/entitlements";
import { buildMarketplaceCatalog, resolveMarketplaceModule } from "@/lib/marketplace/catalog";
import { getModuleDefinition } from "@/lib/modules/catalog";
import { activateLicense, createLicense, suspendLicense } from "@/lib/marketplace/licenses";
import { createTrial, startTrial } from "@/lib/marketplace/trials";

const NOW = "2026-01-01T00:00:00.000Z";
const catalog = buildMarketplaceCatalog();

describe("evaluateModuleEligibility", () => {
  it("módulo planned no Module Engine nunca é elegível em produção", () => {
    const mkt = resolveMarketplaceModule("automation.campaigns", catalog)!;
    const result = evaluateModuleEligibility({
      installation: { deploymentPlan: "dedicated", enabledModules: ["core.contacts"] },
      tenantId: "tenant-1",
      marketplaceModule: mkt,
      moduleDefinition: getModuleDefinition("automation.campaigns"),
    });
    expect(result.eligible).toBe(false);
    expect(result.recommendedAction).toBe("wait_for_module_release");
  });

  it("plano incompatível bloqueia e recomenda upgrade", () => {
    const mkt = resolveMarketplaceModule("channel.whatsapp", catalog)!;
    const result = evaluateModuleEligibility({
      installation: { deploymentPlan: "lite", enabledModules: ["core.contacts"] },
      tenantId: "tenant-1",
      marketplaceModule: mkt,
      moduleDefinition: getModuleDefinition("channel.whatsapp"),
    });
    expect(result.eligible).toBe(false);
    expect(result.recommendedAction).toBe("upgrade_plan");
  });

  it("dependência ausente bloqueia e recomenda resolvê-la", () => {
    const mkt = resolveMarketplaceModule("channel.whatsapp", catalog)!;
    const result = evaluateModuleEligibility({
      installation: { deploymentPlan: "dedicated", enabledModules: ["channel.whatsapp"] }, // sem core.contacts
      tenantId: "tenant-1",
      marketplaceModule: mkt,
      moduleDefinition: getModuleDefinition("channel.whatsapp"),
    });
    expect(result.eligible).toBe(false);
    expect(result.recommendedAction).toBe("resolve_dependency");
  });

  it("incompatibilidade com módulo já licenciado bloqueia mesmo com tudo mais ok", () => {
    const mkt = { ...resolveMarketplaceModule("integration.nuvemshop", catalog)!, incompatibleModules: ["channel.whatsapp"] };
    const result = evaluateModuleEligibility({
      installation: { deploymentPlan: "dedicated", enabledModules: ["core.contacts", "integration.nuvemshop", "channel.whatsapp"] },
      tenantId: "tenant-1",
      marketplaceModule: mkt,
      moduleDefinition: getModuleDefinition("integration.nuvemshop"),
      activeLicensedModuleIds: ["channel.whatsapp"],
    });
    expect(result.eligible).toBe(false);
    expect(result.recommendedAction).toBe("remove_conflicting_module");
  });

  it("billing negando bloqueia mesmo que tudo mais esteja ok tecnicamente", () => {
    const mkt = resolveMarketplaceModule("ai.agents", catalog)!;
    const result = evaluateModuleEligibility({
      installation: { deploymentPlan: "dedicated", enabledModules: ["core.contacts", "ai.agents"] },
      tenantId: "tenant-1",
      marketplaceModule: mkt,
      moduleDefinition: getModuleDefinition("ai.agents"),
      billing: { authorized: false, requirement: "purchase_addon", blockers: ["não comprado"], warnings: [] },
    });
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContain("não comprado");
  });

  it("módulo elegível sem blocker recomenda start_trial quando trial disponível", () => {
    const mkt = resolveMarketplaceModule("channel.whatsapp", catalog)!;
    const result = evaluateModuleEligibility({
      installation: { deploymentPlan: "dedicated", enabledModules: ["core.contacts", "channel.whatsapp"] },
      tenantId: "tenant-1",
      marketplaceModule: mkt,
      moduleDefinition: getModuleDefinition("channel.whatsapp"),
      billing: { authorized: true, requirement: null, blockers: [], warnings: [] },
    });
    expect(result.eligible).toBe(true);
    expect(result.recommendedAction).toBe("start_trial");
  });

  it("módulo comercial retired nunca elegível mesmo tecnicamente estável", () => {
    const mkt = { ...resolveMarketplaceModule("core.crm", catalog)!, status: "retired" as const };
    const result = evaluateModuleEligibility({
      installation: { deploymentPlan: "dedicated", enabledModules: ["core.crm"] },
      tenantId: "tenant-1",
      marketplaceModule: mkt,
      moduleDefinition: getModuleDefinition("core.crm"),
    });
    expect(result.eligible).toBe(false);
  });
});

describe("resolveMarketplaceEntitlements", () => {
  it("módulo core sem licença é incluído por padrão", () => {
    const result = resolveMarketplaceEntitlements({
      installation: { enabledModules: ["core.crm", "core.contacts"] },
      catalog,
      licenses: [],
      trials: [],
    });
    const entry = result.entitlements.find((e) => e.moduleId === "core.crm");
    expect(entry?.authorized).toBe(true);
    expect(entry?.source).toBe("included_in_plan");
  });

  it("módulo não-core sem licença nunca é autorizado", () => {
    const result = resolveMarketplaceEntitlements({
      installation: { enabledModules: ["core.contacts", "ai.agents"] },
      catalog,
      licenses: [],
      trials: [],
    });
    const entry = result.entitlements.find((e) => e.moduleId === "ai.agents");
    expect(entry?.authorized).toBe(false);
    expect(entry?.source).toBe("not_licensed");
  });

  it("licença suspensa de módulo não-core nega; core em modo restrito", () => {
    const license = suspendLicense(activateLicense(createLicense({ id: "l1", tenantId: "t1", installationId: "i1", moduleId: "ai.agents", source: "paid_addon", now: NOW })));
    const result = resolveMarketplaceEntitlements({
      installation: { enabledModules: ["core.contacts", "ai.agents"] },
      catalog,
      licenses: [license],
      trials: [],
    });
    const entry = result.entitlements.find((e) => e.moduleId === "ai.agents");
    expect(entry?.authorized).toBe(false);
    expect(entry?.source).toBe("license_suspended");
    expect(result.suspendedModules).toContain("ai.agents");
  });

  it("trial ativo autoriza módulo mesmo sem licença nem compra via Billing", () => {
    const mktModule = resolveMarketplaceModule("channel.whatsapp", catalog)!;
    const trial = startTrial(createTrial({ id: "t1", tenantId: "t1", installationId: "i1", moduleId: "channel.whatsapp", startsAt: NOW, durationDays: 14 }, mktModule), NOW);
    const result = resolveMarketplaceEntitlements({
      installation: { enabledModules: ["core.contacts", "channel.whatsapp"] },
      catalog,
      licenses: [],
      trials: [trial],
      billingAuthorizedModuleIds: [], // Billing não autorizou nada — trial deve bypassar
    });
    const entry = result.entitlements.find((e) => e.moduleId === "channel.whatsapp");
    expect(entry?.authorized).toBe(true);
    expect(entry?.source).toBe("trial_active");
    expect(result.trialModules).toContain("channel.whatsapp");
  });

  it("DISABLED_MODULES (ausência em installation.enabledModules) sempre prevalece, mesmo com licença ativa", () => {
    const license = activateLicense(createLicense({ id: "l1", tenantId: "t1", installationId: "i1", moduleId: "ai.agents", source: "paid_addon", now: NOW }));
    const result = resolveMarketplaceEntitlements({
      installation: { enabledModules: ["core.contacts"] }, // ai.agents ausente (ex.: DISABLED_MODULES)
      catalog,
      licenses: [license],
      trials: [],
    });
    const entry = result.entitlements.find((e) => e.moduleId === "ai.agents");
    expect(entry?.authorized).toBe(false);
    expect(entry?.source).toBe("blocked_by_module_engine");
  });

  it("módulo planned nunca autorizado mesmo com licença ativa", () => {
    const license = activateLicense(createLicense({ id: "l1", tenantId: "t1", installationId: "i1", moduleId: "automation.campaigns", source: "manual_grant", now: NOW }));
    const result = resolveMarketplaceEntitlements({
      installation: { enabledModules: ["core.contacts", "automation.campaigns"] },
      catalog,
      licenses: [license],
      trials: [],
    });
    const entry = result.entitlements.find((e) => e.moduleId === "automation.campaigns");
    expect(entry?.authorized).toBe(false);
    expect(entry?.source).toBe("module_planned");
  });

  it("billing negando bloqueia módulo não-core mesmo tecnicamente habilitado", () => {
    const result = resolveMarketplaceEntitlements({
      installation: { enabledModules: ["core.contacts", "ai.agents"] },
      catalog,
      licenses: [],
      trials: [],
      billingAuthorizedModuleIds: [],
    });
    const entry = result.entitlements.find((e) => e.moduleId === "ai.agents");
    expect(entry?.authorized).toBe(false);
    expect(entry?.source).toBe("blocked_by_billing");
  });
});
