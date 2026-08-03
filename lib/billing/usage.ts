/**
 * Consumo vs. limites contratados — Foundation v1. Nunca bloqueia nada de
 * verdade (nenhuma função aqui impede uma ação); só calcula, avisa e
 * recomenda. Limite ausente em `BillingLimits` = ilimitado/não controlado —
 * nunca tratado como zero (ver `types.ts::BillingLimits`).
 */
import { getBillingPlanDefinition } from "./catalog";
import type { BillingLimits, BillingUsageSnapshot } from "./types";

export type UsageMetricStatus = "unlimited" | "ok" | "warning" | "exceeded";

export type UsageMetricEvaluation = {
  metric: keyof BillingLimits;
  used: number;
  limit?: number;
  /** 0–100+, `null` quando o limite está ausente (ilimitado). */
  percentage: number | null;
  status: UsageMetricStatus;
};

const WARNING_THRESHOLD_PERCENTAGE = 80;

export function calculateUsagePercentage(used: number, limit?: number): number | null {
  if (limit === undefined || limit <= 0) return null;
  return Math.round((used / limit) * 100);
}

function statusFor(percentage: number | null): UsageMetricStatus {
  if (percentage === null) return "unlimited";
  if (percentage >= 100) return "exceeded";
  if (percentage >= WARNING_THRESHOLD_PERCENTAGE) return "warning";
  return "ok";
}

/** Avalia cada métrica presente em `limits` contra `usage.metrics` — chave ausente em `metrics` conta como 0. */
export function evaluateUsageAgainstLimits(usage: BillingUsageSnapshot, limits: BillingLimits): UsageMetricEvaluation[] {
  return (Object.keys(limits) as Array<keyof BillingLimits>).map((metric) => {
    const limit = limits[metric];
    const used = usage.metrics[metric as string] ?? 0;
    const percentage = calculateUsagePercentage(used, limit);
    return { metric, used, limit, percentage, status: statusFor(percentage) };
  });
}

const METRIC_LABEL: Record<keyof BillingLimits, string> = {
  users: "usuários",
  contacts: "contatos",
  storageMb: "armazenamento (MB)",
  messagesPerMonth: "mensagens/mês",
  campaignsPerMonth: "campanhas/mês",
  aiActionsPerMonth: "ações de IA/mês",
  activeModules: "módulos ativos",
  whatsappConnections: "conexões WhatsApp",
};

export function deriveUsageWarnings(evaluations: UsageMetricEvaluation[]): string[] {
  return evaluations
    .filter((e) => e.status === "warning")
    .map((e) => `${METRIC_LABEL[e.metric]}: ${e.used}/${e.limit} (${e.percentage}%) — perto do limite`);
}

/** "Blocker" aqui é só um alerta forte — nunca impede a ação de verdade (ver cabeçalho do módulo). */
export function deriveUsageBlockers(evaluations: UsageMetricEvaluation[]): string[] {
  return evaluations
    .filter((e) => e.status === "exceeded")
    .map((e) => `${METRIC_LABEL[e.metric]}: ${e.used}/${e.limit} — limite excedido`);
}

/** Sugere o próximo plano de upgrade do catálogo quando alguma métrica excedeu — nunca decide sozinho, só recomenda. */
export function suggestPlanUpgrade(planId: string, evaluations: UsageMetricEvaluation[]): string | null {
  const hasExceeded = evaluations.some((e) => e.status === "exceeded");
  if (!hasExceeded) return null;
  const plan = getBillingPlanDefinition(planId);
  return plan?.upgradeTo[0] ?? null;
}
