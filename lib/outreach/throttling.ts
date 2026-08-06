/**
 * Throttling — Outreach & AI Cadence Engine, Foundation v1.
 *
 * `evaluateThrottle` só FAZ CONTAS sobre contadores fornecidos pelo chamador
 * — nunca espera de verdade, nunca mede tempo real. Valores default de
 * `OutreachThrottlingPolicy` refletem os números REAIS já documentados em
 * `lib/automation/throttle.ts`/CLAUDE.md §WAHA (1.2s + jitter ≤800ms 1:1,
 * 5s campanha, janela 7h-22h) — nunca inventados aqui.
 */
import type { OutreachThrottleCounters, OutreachThrottleEvaluation, OutreachThrottlingPolicy } from "./types";

export const DEFAULT_OUTREACH_THROTTLING_POLICY: OutreachThrottlingPolicy = {
  maxPerMinute: 12,
  maxPerHour: 720,
  maxPerDay: 5000,
  minDelaySeconds: 5,
  maxConcurrent: 1,
  randomJitterSeconds: 0.8,
};

export function evaluateThrottle(policy: OutreachThrottlingPolicy, counters: OutreachThrottleCounters): OutreachThrottleEvaluation {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (counters.sentInCurrentMinute >= policy.maxPerMinute) blockers.push(`limite por minuto atingido (${counters.sentInCurrentMinute}/${policy.maxPerMinute})`);
  if (counters.sentInCurrentHour >= policy.maxPerHour) blockers.push(`limite por hora atingido (${counters.sentInCurrentHour}/${policy.maxPerHour})`);
  if (counters.sentInCurrentDay >= policy.maxPerDay) blockers.push(`limite por dia atingido (${counters.sentInCurrentDay}/${policy.maxPerDay})`);
  if (counters.concurrentInFlight >= policy.maxConcurrent) blockers.push(`limite de concorrência atingido (${counters.concurrentInFlight}/${policy.maxConcurrent})`);

  if (counters.sentInCurrentMinute >= policy.maxPerMinute * 0.8) warnings.push("perto do limite por minuto (>= 80%)");
  if (counters.sentInCurrentDay >= policy.maxPerDay * 0.8) warnings.push("perto do limite diário (>= 80%)");

  return {
    allowed: blockers.length === 0,
    delaySeconds: blockers.length === 0 ? calculateThrottleDelay(policy) : 0,
    blockers,
    warnings,
  };
}

/** Delay determinístico mínimo antes do PRÓXIMO envio — inclui o jitter médio (nunca `Math.random`; o jitter real acontece na camada de canal, fora desta Foundation). */
export function calculateThrottleDelay(policy: OutreachThrottlingPolicy): number {
  const jitter = policy.randomJitterSeconds ?? 0;
  return policy.minDelaySeconds + jitter / 2;
}

export type OutreachThrottlePreview = {
  policy: OutreachThrottlingPolicy;
  estimatedSecondsFor: (messageCount: number) => number;
};

export function buildThrottlePreview(policy: OutreachThrottlingPolicy): OutreachThrottlePreview {
  return {
    policy,
    estimatedSecondsFor: (messageCount: number) => Math.max(0, messageCount - 1) * calculateThrottleDelay(policy),
  };
}

export function deriveThrottleWarnings(evaluation: OutreachThrottleEvaluation): string[] {
  return evaluation.warnings;
}

export function deriveThrottleBlockers(evaluation: OutreachThrottleEvaluation): string[] {
  return evaluation.blockers;
}
