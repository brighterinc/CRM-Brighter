import { describe, expect, it } from "vitest";

import { generateMarketplaceSummary, renderMarketplaceSummaryMarkdown } from "@/lib/marketplace/summary";
import { resolveMarketplaceEntitlements } from "@/lib/marketplace/entitlements";
import { buildMarketplaceCatalog, createDemoBundles, createDemoLicenses } from "@/lib/marketplace";
import { createDemoInstallations } from "@/lib/control-plane/repository";

describe("generateMarketplaceSummary", () => {
  const installation = createDemoInstallations()[0]!;
  const catalog = buildMarketplaceCatalog();
  const licenses = createDemoLicenses([installation]);
  const bundles = createDemoBundles();
  const entitlements = resolveMarketplaceEntitlements({ installation: { enabledModules: installation.modules }, catalog, licenses, trials: [] });

  it("calcula módulos disponíveis, incluídos e prontidão de ativação", () => {
    const summary = generateMarketplaceSummary({ installation, catalog, licenses, trials: [], entitlements, bundles });
    expect(summary.installationId).toBe(installation.id);
    expect(summary.availableModulesCount).toBe(catalog.filter((m) => m.enabled).length);
    expect(summary.bundlesCount).toBe(bundles.length);
    expect(["ready", "blocked"]).toContain(summary.activationReadiness);
  });

  it("extraBlockers/extraWarnings do chamador entram no resultado final", () => {
    const summary = generateMarketplaceSummary({ installation, catalog, licenses, trials: [], entitlements, bundles, extraBlockers: ["blocker extra"], extraWarnings: ["warning extra"] });
    expect(summary.blockers).toContain("blocker extra");
    expect(summary.warnings).toContain("warning extra");
  });

  it("dependencies/incompatibilities refletem o catálogo", () => {
    const summary = generateMarketplaceSummary({ installation, catalog, licenses, trials: [], entitlements });
    expect(summary.dependencies.some((d) => d.includes("channel.whatsapp"))).toBe(true);
  });
});

describe("renderMarketplaceSummaryMarkdown", () => {
  it("inclui cliente, plano e prontidão de ativação no markdown", () => {
    const installation = createDemoInstallations()[0]!;
    const catalog = buildMarketplaceCatalog();
    const licenses = createDemoLicenses([installation]);
    const entitlements = resolveMarketplaceEntitlements({ installation: { enabledModules: installation.modules }, catalog, licenses, trials: [] });
    const summary = generateMarketplaceSummary({ installation, catalog, licenses, trials: [], entitlements });
    const markdown = renderMarketplaceSummaryMarkdown(summary);
    expect(markdown).toContain(installation.company);
    expect(markdown).toContain("Prontidão de ativação");
  });

  it("só inclui seção de Blockers quando há blocker", () => {
    const installation = createDemoInstallations()[0]!;
    const catalog = buildMarketplaceCatalog();
    const entitlements = resolveMarketplaceEntitlements({ installation: { enabledModules: [] }, catalog, licenses: [], trials: [] });
    const summary = generateMarketplaceSummary({ installation, catalog, licenses: [], trials: [], entitlements });
    const markdown = renderMarketplaceSummaryMarkdown(summary);
    expect(markdown).toContain("## Blockers");
  });
});
