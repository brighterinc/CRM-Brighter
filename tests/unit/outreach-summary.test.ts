import { describe, expect, it } from "vitest";

import { calculateOutreachMetrics } from "@/lib/outreach/metrics";
import { createDemoCadence, createDemoCampaigns } from "@/lib/outreach/repository";
import { generateOutreachSummary, renderOutreachSummaryMarkdown } from "@/lib/outreach/summary";
import type { Installation } from "@/lib/control-plane/types";
import type { OutreachAudiencePreview } from "@/lib/outreach/types";

const installation = {
  id: "inst-1",
  slug: "empresa-exemplo",
  company: "Empresa Exemplo",
  deploymentPlan: "dedicated",
  modules: ["core.contacts", "channel.whatsapp"],
  createdAt: "2026-01-01T00:00:00.000Z",
} as unknown as Installation;

const emptyPreview: OutreachAudiencePreview = {
  segmentId: "seg-1",
  totalMatched: 0,
  eligible: [],
  excluded: [],
  eligibleCount: 0,
  excludedCount: 0,
  cappedByMaxAudienceSize: false,
  generatedAt: "2026-01-01T00:00:00.000Z",
};

describe("generateOutreachSummary", () => {
  it("agrega contagem de campanhas/enrollments e blockers de cadência inválida (módulo planned)", () => {
    const cadence = createDemoCadence();
    const campaigns = createDemoCampaigns([installation]);
    const metrics = calculateOutreachMetrics({ audiencePreview: emptyPreview, enrollments: [] });

    const summary = generateOutreachSummary({ installation, campaigns, cadences: [cadence], enrollments: [], metrics });

    expect(summary.installationId).toBe("inst-1");
    expect(summary.totalCampaigns).toBe(1);
    expect(summary.blockers.some((b) => b.includes("automation.campaigns"))).toBe(true);
  });

  it("sem cadências, sem campanhas: listas vazias, nunca lança", () => {
    const metrics = calculateOutreachMetrics({ audiencePreview: emptyPreview, enrollments: [] });
    const summary = generateOutreachSummary({ installation, campaigns: [], cadences: [], enrollments: [], metrics });
    expect(summary.campaigns).toEqual([]);
    expect(summary.recentEnrollments).toEqual([]);
  });

  it("extraBlockers/extraWarnings são incluídos no resultado", () => {
    const metrics = calculateOutreachMetrics({ audiencePreview: emptyPreview, enrollments: [] });
    const summary = generateOutreachSummary({
      installation,
      campaigns: [],
      cadences: [],
      enrollments: [],
      metrics,
      extraBlockers: ["blocker de teste"],
      extraWarnings: ["warning de teste"],
    });
    expect(summary.blockers).toContain("blocker de teste");
    expect(summary.warnings).toContain("warning de teste");
  });
});

describe("renderOutreachSummaryMarkdown", () => {
  it("gera Markdown com as seções esperadas e a confirmação de nenhum envio real", () => {
    const metrics = calculateOutreachMetrics({ audiencePreview: emptyPreview, enrollments: [] });
    const summary = generateOutreachSummary({ installation, campaigns: [], cadences: [], enrollments: [], metrics });
    const markdown = renderOutreachSummaryMarkdown(summary);

    expect(markdown).toContain("# Outreach & Cadências");
    expect(markdown).toContain("## Métricas");
    expect(markdown).toContain("## Campanhas");
    expect(markdown).toContain("Nenhuma campanha configurada.");
    expect(markdown).toContain("Nenhuma mensagem real foi enviada");
  });
});
