/**
 * Métricas — Outreach & AI Cadence Engine, Foundation v1. Toda taxa é
 * calculada a partir de contagens reais dos enrollments fornecidos — nunca
 * um número inventado/estimado.
 */
import type { OutreachAudiencePreview, OutreachEnrollment, OutreachMetrics } from "./types";

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

export function calculateResponseRate(metrics: Pick<OutreachMetrics, "replied" | "simulatedSent">): number {
  return safeRate(metrics.replied, metrics.simulatedSent);
}

export function calculateQualificationRate(metrics: Pick<OutreachMetrics, "qualified" | "replied">): number {
  return safeRate(metrics.qualified, metrics.replied);
}

export function calculateOptOutRate(metrics: Pick<OutreachMetrics, "optedOut" | "eligibleContacts">): number {
  return safeRate(metrics.optedOut, metrics.eligibleContacts);
}

export function calculateFailureRate(metrics: Pick<OutreachMetrics, "failed" | "simulatedSent">): number {
  return safeRate(metrics.failed, metrics.simulatedSent);
}

export type CalculateOutreachMetricsInput = {
  audiencePreview: OutreachAudiencePreview;
  enrollments: OutreachEnrollment[];
};

export function calculateOutreachMetrics(input: CalculateOutreachMetricsInput): OutreachMetrics {
  const { audiencePreview, enrollments } = input;
  const count = (statuses: OutreachEnrollment["status"][]) => enrollments.filter((e) => statuses.includes(e.status)).length;

  const scheduled = count(["scheduled", "pending"]);
  const simulatedSent = count(["active", "waiting", "responded", "qualified", "transferred", "completed"]);
  const replied = count(["responded", "qualified", "transferred"]);
  const interested = enrollments.filter((e) => e.responseClassification === "interested").length;
  const qualified = count(["qualified"]);
  const transferred = count(["transferred"]);
  const optedOut = count(["opted_out"]);
  const failed = count(["failed"]);
  const completed = count(["completed"]);

  const base = {
    audienceSize: audiencePreview.totalMatched,
    eligibleContacts: audiencePreview.eligibleCount,
    blockedContacts: audiencePreview.excludedCount,
    scheduled,
    simulatedSent,
    delivered: simulatedSent,
    read: simulatedSent,
    replied,
    interested,
    qualified,
    transferred,
    optedOut,
    failed,
    completed,
  };

  return {
    ...base,
    responseRate: calculateResponseRate(base),
    qualificationRate: calculateQualificationRate(base),
    optOutRate: calculateOptOutRate(base),
    failureRate: calculateFailureRate(base),
  };
}

export function generateCampaignMetricsSummaryLines(metrics: OutreachMetrics): string[] {
  return [
    `Audiência: ${metrics.audienceSize} (elegíveis: ${metrics.eligibleContacts}, bloqueados: ${metrics.blockedContacts})`,
    `Envios simulados: ${metrics.simulatedSent} (agendados: ${metrics.scheduled})`,
    `Respostas: ${metrics.replied} (taxa: ${(metrics.responseRate * 100).toFixed(1)}%) — interessados: ${metrics.interested}, qualificados: ${metrics.qualified} (taxa: ${(metrics.qualificationRate * 100).toFixed(1)}%)`,
    `Transferidos: ${metrics.transferred}, opt-outs: ${metrics.optedOut} (taxa: ${(metrics.optOutRate * 100).toFixed(1)}%)`,
    `Falhas: ${metrics.failed} (taxa: ${(metrics.failureRate * 100).toFixed(1)}%), concluídos: ${metrics.completed}`,
  ];
}
