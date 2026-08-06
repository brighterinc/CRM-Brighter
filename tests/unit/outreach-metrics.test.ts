import { describe, expect, it } from "vitest";

import { calculateFailureRate, calculateOptOutRate, calculateOutreachMetrics, calculateQualificationRate, calculateResponseRate, generateCampaignMetricsSummaryLines } from "@/lib/outreach/metrics";
import type { EnrollmentStatus, OutreachAudiencePreview, OutreachEnrollment } from "@/lib/outreach/types";

function enrollment(id: string, status: EnrollmentStatus, responseClassification?: OutreachEnrollment["responseClassification"]): OutreachEnrollment {
  return {
    id,
    campaignId: "camp-1",
    cadenceId: "cad-1",
    contactId: id,
    status,
    responseClassification,
    idempotencyKey: `camp-1:${id}`,
    attempts: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const audiencePreview: OutreachAudiencePreview = {
  segmentId: "seg-1",
  totalMatched: 10,
  eligible: ["e1", "e2"],
  excluded: [],
  eligibleCount: 8,
  excludedCount: 2,
  cappedByMaxAudienceSize: false,
  generatedAt: "2026-01-01T00:00:00.000Z",
};

describe("calculateOutreachMetrics", () => {
  it("conta enrollments por status corretamente", () => {
    const enrollments = [
      enrollment("a", "active"),
      enrollment("b", "responded", "interested"),
      enrollment("c", "qualified"),
      enrollment("d", "transferred"),
      enrollment("e", "opted_out"),
      enrollment("f", "failed"),
      enrollment("g", "completed"),
    ];
    const metrics = calculateOutreachMetrics({ audiencePreview, enrollments });

    expect(metrics.audienceSize).toBe(10);
    expect(metrics.eligibleContacts).toBe(8);
    expect(metrics.blockedContacts).toBe(2);
    expect(metrics.replied).toBe(3); // responded + qualified + transferred
    expect(metrics.interested).toBe(1);
    expect(metrics.qualified).toBe(1);
    expect(metrics.transferred).toBe(1);
    expect(metrics.optedOut).toBe(1);
    expect(metrics.failed).toBe(1);
    expect(metrics.completed).toBe(1);
  });

  it("lista vazia nunca lança, todas as métricas zeradas", () => {
    const metrics = calculateOutreachMetrics({ audiencePreview: { ...audiencePreview, eligibleCount: 0 }, enrollments: [] });
    expect(metrics.simulatedSent).toBe(0);
    expect(metrics.responseRate).toBe(0);
  });
});

describe("calculateResponseRate / calculateQualificationRate / calculateOptOutRate / calculateFailureRate", () => {
  it("divisão por zero devolve 0, nunca NaN/Infinity", () => {
    expect(calculateResponseRate({ replied: 0, simulatedSent: 0 })).toBe(0);
    expect(calculateQualificationRate({ qualified: 0, replied: 0 })).toBe(0);
    expect(calculateOptOutRate({ optedOut: 0, eligibleContacts: 0 })).toBe(0);
    expect(calculateFailureRate({ failed: 0, simulatedSent: 0 })).toBe(0);
  });

  it("calcula a taxa correta quando há denominador", () => {
    expect(calculateResponseRate({ replied: 5, simulatedSent: 10 })).toBe(0.5);
    expect(calculateFailureRate({ failed: 1, simulatedSent: 4 })).toBe(0.25);
  });
});

describe("generateCampaignMetricsSummaryLines", () => {
  it("devolve linhas legíveis com percentuais formatados", () => {
    const metrics = calculateOutreachMetrics({ audiencePreview, enrollments: [enrollment("a", "responded", "interested")] });
    const lines = generateCampaignMetricsSummaryLines(metrics);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes("Audiência"))).toBe(true);
  });
});
