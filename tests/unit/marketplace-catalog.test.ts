import { describe, expect, it } from "vitest";

import {
  buildMarketplaceCatalog,
  deriveCatalogBlockers,
  deriveCatalogWarnings,
  listPublicOffers,
  listTenantEligibleOffers,
  resolveMarketplaceModule,
  validateMarketplaceCatalog,
  type MarketplaceCatalogSeedEntry,
} from "@/lib/marketplace/catalog";

describe("buildMarketplaceCatalog", () => {
  it("deriva allowedPlans do Module Engine — nunca aceita valor solto do seed", () => {
    const catalog = buildMarketplaceCatalog();
    const whatsapp = catalog.find((m) => m.moduleId === "channel.whatsapp");
    expect(whatsapp?.allowedPlans).toEqual(["dedicated"]);
  });

  it("módulo inexistente no seed produz allowedPlans vazio (nunca inventa permissão)", () => {
    const seed: MarketplaceCatalogSeedEntry[] = [
      { moduleId: "modulo.fantasma", name: "Fantasma", description: "x", visibility: "public", status: "active", category: "x", trialAvailable: false, version: "1.0.0", enabled: true },
    ];
    const catalog = buildMarketplaceCatalog(seed);
    expect(catalog[0]!.allowedPlans).toEqual([]);
  });
});

describe("validateMarketplaceCatalog", () => {
  it("módulo inexistente no Module Engine gera blocker", () => {
    const seed: MarketplaceCatalogSeedEntry[] = [
      { moduleId: "modulo.fantasma", name: "Fantasma", description: "x", visibility: "public", status: "active", category: "x", trialAvailable: false, version: "1.0.0", enabled: true },
    ];
    const issues = validateMarketplaceCatalog(buildMarketplaceCatalog(seed));
    expect(issues.some((i) => i.code === "module_not_in_module_engine" && i.severity === "blocker")).toBe(true);
  });

  it("módulo planned no Module Engine habilitado comercialmente gera blocker", () => {
    const seed: MarketplaceCatalogSeedEntry[] = [
      { moduleId: "automation.campaigns", name: "Campanhas", description: "x", visibility: "public", status: "active", category: "x", trialAvailable: false, version: "1.0.0", enabled: true },
    ];
    const issues = validateMarketplaceCatalog(buildMarketplaceCatalog(seed));
    expect(issues.some((i) => i.code === "planned_module_enabled_for_sale")).toBe(true);
  });

  it("módulo retired habilitado gera blocker (nunca aceita nova licença)", () => {
    const seed: MarketplaceCatalogSeedEntry[] = [
      { moduleId: "core.crm", name: "CRM", description: "x", visibility: "public", status: "retired", category: "x", trialAvailable: false, version: "1.0.0", enabled: true },
    ];
    const issues = validateMarketplaceCatalog(buildMarketplaceCatalog(seed));
    expect(issues.some((i) => i.code === "retired_module_enabled")).toBe(true);
  });

  it("módulo deprecated gera warning, não blocker", () => {
    const seed: MarketplaceCatalogSeedEntry[] = [
      { moduleId: "core.crm", name: "CRM", description: "x", visibility: "public", status: "deprecated", category: "x", trialAvailable: false, version: "1.0.0", enabled: true },
    ];
    const issues = validateMarketplaceCatalog(buildMarketplaceCatalog(seed));
    const found = issues.find((i) => i.code === "deprecated_module");
    expect(found?.severity).toBe("warning");
  });

  it("oferta private sem eligibleTenantIds gera warning", () => {
    const seed: MarketplaceCatalogSeedEntry[] = [
      { moduleId: "core.crm", name: "CRM", description: "x", visibility: "private", status: "active", category: "x", trialAvailable: false, version: "1.0.0", enabled: true },
    ];
    const issues = validateMarketplaceCatalog(buildMarketplaceCatalog(seed));
    expect(issues.some((i) => i.code === "private_offer_without_eligible_tenants")).toBe(true);
  });

  it("o catálogo real (MARKETPLACE_CATALOG_SEED) só tem os blockers/warnings esperados — retired/planned desabilitados corretamente", () => {
    const blockers = deriveCatalogBlockers();
    expect(blockers).toEqual([]);
    const warnings = deriveCatalogWarnings();
    expect(warnings.some((w) => w.moduleId === "integration.sphere")).toBe(true);
  });
});

describe("resolveMarketplaceModule / listPublicOffers / listTenantEligibleOffers", () => {
  it("resolveMarketplaceModule encontra por moduleId técnico", () => {
    const found = resolveMarketplaceModule("core.crm");
    expect(found?.moduleId).toBe("core.crm");
  });

  it("listPublicOffers nunca inclui internal/hidden/disabled", () => {
    const offers = listPublicOffers();
    expect(offers.every((m) => m.visibility === "public" && m.enabled)).toBe(true);
    expect(offers.some((m) => m.moduleId === "automation.campaigns")).toBe(false);
    expect(offers.some((m) => m.moduleId === "integration.lumina")).toBe(false);
  });

  it("listTenantEligibleOffers inclui público sempre, privado só se elegível", () => {
    const catalog = buildMarketplaceCatalog([
      { moduleId: "core.crm", name: "CRM", description: "x", visibility: "public", status: "active", category: "x", trialAvailable: false, version: "1.0.0", enabled: true },
      { moduleId: "core.contacts", name: "Contatos", description: "x", visibility: "private", status: "active", category: "x", trialAvailable: false, version: "1.0.0", enabled: true, eligibleTenantIds: ["tenant-a"] },
    ]);
    const forTenantA = listTenantEligibleOffers("tenant-a", catalog);
    const forTenantB = listTenantEligibleOffers("tenant-b", catalog);
    expect(forTenantA.map((m) => m.moduleId)).toEqual(["core.crm", "core.contacts"]);
    expect(forTenantB.map((m) => m.moduleId)).toEqual(["core.crm"]);
  });
});
