import { describe, expect, it } from "vitest";

import { generateProvisioningAdapterSummary, renderProvisioningAdapterSummaryMarkdown, simulateProvisioningAdapterScenario } from "@/lib/provisioning-adapters";

describe("generateProvisioningAdapterSummary", () => {
  it("dedicated-healthy: mappedSteps+unmappedSteps === totalSteps, sem blocker", async () => {
    const result = await simulateProvisioningAdapterScenario("dedicated-healthy");
    const summary = generateProvisioningAdapterSummary(result);

    expect(summary.mappedSteps + summary.unmappedSteps).toBe(summary.totalSteps);
    expect(summary.blockedSteps).toBe(0);
    expect(summary.failedSteps).toBe(0);
    expect(summary.readySteps).toBe(summary.mappedSteps);
    expect(summary.blockers).toEqual([]);
    expect(summary.recommendedNextAction).toMatch(/nenhuma ação necessária/i);
  });

  it("missing-adapter: blockedSteps > 0, recommendedNextAction cita o bloqueio", async () => {
    const result = await simulateProvisioningAdapterScenario("missing-adapter");
    const summary = generateProvisioningAdapterSummary(result);
    expect(summary.blockedSteps).toBeGreaterThan(0);
    expect(summary.recommendedNextAction).toMatch(/resolver bloqueio/i);
  });

  it("providerCoverage nunca lista provider fora dos 14 declarados", async () => {
    const result = await simulateProvisioningAdapterScenario("dedicated-healthy");
    const summary = generateProvisioningAdapterSummary(result);
    const validProviders = new Set(["noop", "fake", "supabase", "vercel", "dns", "vps", "docker", "reverse_proxy", "redis", "email", "whatsapp", "chatwoot", "evolution", "waha"]);
    for (const p of summary.providerCoverage) expect(validProviders.has(p.provider)).toBe(true);
  });

  it("nunca vaza segredo no JSON do summary", async () => {
    const result = await simulateProvisioningAdapterScenario("supabase-ready");
    const summary = generateProvisioningAdapterSummary(result);
    expect(JSON.stringify(summary)).not.toMatch(/serviceRole|password|apiKey|secret/i);
  });
});

describe("renderProvisioningAdapterSummaryMarkdown", () => {
  it("inclui seções obrigatórias e nunca HTML/script", async () => {
    const result = await simulateProvisioningAdapterScenario("dedicated-healthy");
    const summary = generateProvisioningAdapterSummary(result);
    const markdown = renderProvisioningAdapterSummaryMarkdown(summary);

    expect(markdown).toContain("# Adaptadores de provisionamento");
    expect(markdown).toContain("## Etapas");
    expect(markdown).toContain("## Rollback");
    expect(markdown).toContain("## Cobertura por provider");
    expect(markdown).not.toMatch(/<script/i);
  });

  it("mostra seção de bloqueios só quando há blocker", async () => {
    const healthy = generateProvisioningAdapterSummary(await simulateProvisioningAdapterScenario("dedicated-healthy"));
    const blocked = generateProvisioningAdapterSummary(await simulateProvisioningAdapterScenario("missing-adapter"));

    expect(renderProvisioningAdapterSummaryMarkdown(healthy)).not.toContain("## Bloqueios");
    expect(renderProvisioningAdapterSummaryMarkdown(blocked)).toContain("## Bloqueios");
  });
});
