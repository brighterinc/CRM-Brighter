import { describe, expect, it } from "vitest";

import { generateModuleActivationPlan } from "@/lib/marketplace/activation";
import { evaluateModuleEligibility } from "@/lib/marketplace/eligibility";
import { buildMarketplaceCatalog, resolveMarketplaceModule } from "@/lib/marketplace/catalog";
import { getModuleDefinition } from "@/lib/modules/catalog";
import { compareVersions, deriveVersionWarnings, evaluateVersionCompatibility, planVersionDowngrade, planVersionUpgrade } from "@/lib/marketplace/versioning";
import { activateLicense, createLicense } from "@/lib/marketplace/licenses";

const catalog = buildMarketplaceCatalog();

describe("generateModuleActivationPlan", () => {
  it("plano pronto (elegível, sem blocker) nunca ativa nada de verdade, só planeja", () => {
    const mkt = resolveMarketplaceModule("automation.followups", catalog)!;
    const technical = getModuleDefinition("automation.followups");
    const eligibility = evaluateModuleEligibility({
      installation: { deploymentPlan: "dedicated", enabledModules: ["core.contacts", "ai.agents", "automation.followups"] },
      tenantId: "tenant-1",
      marketplaceModule: mkt,
      moduleDefinition: technical,
    });
    const plan = generateModuleActivationPlan({
      installation: { deploymentPlan: "dedicated", enabledModules: ["core.contacts", "ai.agents", "automation.followups"] },
      marketplaceModule: mkt,
      moduleDefinition: technical,
      eligibility,
      desiredState: "activated",
    });
    expect(plan.blockers).toEqual([]);
    expect(plan.requiredEnvironmentVariables).toContain("ENABLED_MODULES");
    expect(plan.reversible).toBe(true);
  });

  it("plano bloqueado herda os blockers da elegibilidade", () => {
    const mkt = resolveMarketplaceModule("channel.whatsapp", catalog)!;
    const technical = getModuleDefinition("channel.whatsapp");
    const eligibility = evaluateModuleEligibility({
      installation: { deploymentPlan: "dedicated", enabledModules: ["channel.whatsapp"] }, // sem core.contacts
      tenantId: "tenant-1",
      marketplaceModule: mkt,
      moduleDefinition: technical,
    });
    const plan = generateModuleActivationPlan({
      installation: { deploymentPlan: "dedicated", enabledModules: ["channel.whatsapp"] },
      marketplaceModule: mkt,
      moduleDefinition: technical,
      eligibility,
      desiredState: "activated",
    });
    expect(plan.blockers.length).toBeGreaterThan(0);
    expect(plan.recommendation).toContain("bloqueado");
  });

  it("módulo que exige worker/whatsapp recomenda restart/deploy no plano Dedicated", () => {
    const mkt = resolveMarketplaceModule("channel.whatsapp", catalog)!;
    const technical = getModuleDefinition("channel.whatsapp");
    const eligibility = evaluateModuleEligibility({
      installation: { deploymentPlan: "dedicated", enabledModules: ["core.contacts", "channel.whatsapp"] },
      tenantId: "tenant-1",
      marketplaceModule: mkt,
      moduleDefinition: technical,
    });
    const plan = generateModuleActivationPlan({
      installation: { deploymentPlan: "dedicated", enabledModules: ["core.contacts", "channel.whatsapp"] },
      marketplaceModule: mkt,
      moduleDefinition: technical,
      eligibility,
      desiredState: "activated",
    });
    expect(plan.requiresRestart).toBe(true);
    expect(plan.requiresDeploy).toBe(true);
  });

  it("desativação nunca remove dado — só avisa", () => {
    const mkt = resolveMarketplaceModule("ai.agents", catalog)!;
    const technical = getModuleDefinition("ai.agents");
    const eligibility = evaluateModuleEligibility({
      installation: { deploymentPlan: "dedicated", enabledModules: ["core.contacts", "ai.agents"] },
      tenantId: "tenant-1",
      marketplaceModule: mkt,
      moduleDefinition: technical,
    });
    const plan = generateModuleActivationPlan({
      installation: { deploymentPlan: "dedicated", enabledModules: ["core.contacts", "ai.agents"] },
      marketplaceModule: mkt,
      moduleDefinition: technical,
      eligibility,
      desiredState: "deactivated",
    });
    expect(plan.requiredEnvironmentVariables).toContain("DISABLED_MODULES");
    expect(plan.warnings.some((w) => w.includes("não remove dado"))).toBe(true);
  });
});

describe("versioning", () => {
  it("compareVersions detecta upgrade/downgrade/igual", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
    expect(compareVersions("1.1.0", "1.0.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("compareVersions retorna null pra versão inválida", () => {
    expect(compareVersions("abc", "1.0.0")).toBeNull();
  });

  it("evaluateVersionCompatibility avisa em upgrade de major version", () => {
    const result = evaluateVersionCompatibility("channel.whatsapp", "1.0.0", "2.0.0");
    expect(result.changeKind).toBe("upgrade");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("planVersionUpgrade bloqueia se a versão de destino não for maior", () => {
    const license = activateLicense(createLicense({ id: "l1", tenantId: "t1", installationId: "i1", moduleId: "channel.whatsapp", source: "paid_addon", version: "1.2.0" }));
    const plan = planVersionUpgrade(license, "1.0.0");
    expect(plan.blockers.length).toBeGreaterThan(0);
  });

  it("planVersionDowngrade aceita versão menor", () => {
    const license = activateLicense(createLicense({ id: "l1", tenantId: "t1", installationId: "i1", moduleId: "channel.whatsapp", source: "paid_addon", version: "1.2.0" }));
    const plan = planVersionDowngrade(license, "1.0.0");
    expect(plan.blockers).toEqual([]);
    expect(plan.changeKind).toBe("downgrade");
  });

  it("deriveVersionWarnings avisa quando licença está desatualizada em relação ao catálogo", () => {
    const mkt = { ...resolveMarketplaceModule("channel.whatsapp", catalog)!, version: "2.0.0" };
    const license = activateLicense(createLicense({ id: "l1", tenantId: "t1", installationId: "i1", moduleId: "channel.whatsapp", source: "paid_addon", version: "1.0.0" }));
    const warnings = deriveVersionWarnings(mkt, license);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
