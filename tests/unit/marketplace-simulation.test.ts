import { describe, expect, it } from "vitest";

import { MARKETPLACE_SIMULATION_SCENARIOS, simulateMarketplaceScenario } from "@/lib/marketplace/simulation";

describe("MARKETPLACE_SIMULATION_SCENARIOS", () => {
  it("tem exatamente os 26 cenários do spec, sem duplicata", () => {
    expect(MARKETPLACE_SIMULATION_SCENARIOS.length).toBe(26);
    expect(new Set(MARKETPLACE_SIMULATION_SCENARIOS).size).toBe(26);
  });
});

describe("simulateMarketplaceScenario", () => {
  it("todos os cenários rodam sem lançar exceção (determinístico)", () => {
    for (const scenario of MARKETPLACE_SIMULATION_SCENARIOS) {
      expect(() => simulateMarketplaceScenario(scenario)).not.toThrow();
    }
  });

  it("é determinístico — mesma entrada produz a mesma saída de blockers/eligible", () => {
    const a = simulateMarketplaceScenario("paid-addon");
    const b = simulateMarketplaceScenario("paid-addon");
    expect(a.eligibility.eligible).toBe(b.eligibility.eligible);
    expect(a.blockers).toEqual(b.blockers);
  });

  it("included-module: core.crm sempre elegível e autorizado, sem blocker", () => {
    const result = simulateMarketplaceScenario("included-module");
    expect(result.eligibility.eligible).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("module-planned: automation.campaigns nunca elegível em produção", () => {
    const result = simulateMarketplaceScenario("module-planned");
    expect(result.eligibility.eligible).toBe(false);
    expect(result.eligibility.recommendedAction).toBe("wait_for_module_release");
  });

  it("module-retired: nunca aceita nova licença", () => {
    const result = simulateMarketplaceScenario("module-retired");
    expect(result.eligibility.eligible).toBe(false);
  });

  it("incompatible-plan: plano lite nunca autoriza channel.whatsapp", () => {
    const result = simulateMarketplaceScenario("incompatible-plan");
    expect(result.eligibility.eligible).toBe(false);
  });

  it("active-trial: autoriza módulo via trial, mesmo sem Billing", () => {
    const result = simulateMarketplaceScenario("active-trial");
    const entitlement = result.entitlements.entitlements.find((e) => e.moduleId === result.moduleId);
    expect(entitlement?.authorized).toBe(true);
    expect(entitlement?.source).toBe("trial_active");
  });

  it("suspended-license: licença suspensa nunca é autorizada pra módulo não-core", () => {
    const result = simulateMarketplaceScenario("suspended-license");
    const entitlement = result.entitlements.entitlements.find((e) => e.moduleId === result.moduleId);
    expect(entitlement?.authorized).toBe(false);
  });

  it("bundle-valid: bundle de demonstração sem conflito", () => {
    const result = simulateMarketplaceScenario("bundle-valid");
    expect(result.bundlePreview?.blockers).toEqual([]);
  });

  it("bundle-conflict: bundle com módulo incompatível consigo mesmo reporta blocker", () => {
    const result = simulateMarketplaceScenario("bundle-conflict");
    expect((result.bundlePreview?.blockers.length ?? 0)).toBeGreaterThan(0);
  });

  it("version-upgrade: planeja upgrade sem blocker", () => {
    const result = simulateMarketplaceScenario("version-upgrade");
    expect(result.versionPlan?.changeKind).toBe("upgrade");
    expect(result.versionPlan?.blockers).toEqual([]);
  });

  it("version-downgrade: planeja downgrade sem blocker", () => {
    const result = simulateMarketplaceScenario("version-downgrade");
    expect(result.versionPlan?.changeKind).toBe("downgrade");
  });

  it("private-offer: oferta privada bloqueia tenant não elegível", () => {
    const result = simulateMarketplaceScenario("private-offer");
    expect(result.offerAvailable).toBe(false);
  });

  it("activation-ready: plano de ativação sem blocker", () => {
    const result = simulateMarketplaceScenario("activation-ready");
    expect(result.activationPlan.blockers).toEqual([]);
  });

  it("activation-blocked: plano de ativação herda blockers", () => {
    const result = simulateMarketplaceScenario("activation-blocked");
    expect(result.activationPlan.blockers.length).toBeGreaterThan(0);
  });

  it("aceita Installation customizada via opts.installation", () => {
    const base = simulateMarketplaceScenario("included-module");
    const result = simulateMarketplaceScenario("included-module", { installation: base.installation });
    expect(result.installation.id).toBe(base.installation.id);
  });
});
