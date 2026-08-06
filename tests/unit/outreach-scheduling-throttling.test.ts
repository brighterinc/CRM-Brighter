import { describe, expect, it } from "vitest";

import { calculateNextAllowedSendAt, DEFAULT_OUTREACH_SENDING_WINDOW, isInsideSendingWindow, resolveCampaignSchedule, validateSendingWindow } from "@/lib/outreach/scheduling";
import { buildThrottlePreview, calculateThrottleDelay, DEFAULT_OUTREACH_THROTTLING_POLICY, evaluateThrottle } from "@/lib/outreach/throttling";
import type { OutreachSendingWindow, OutreachThrottlingPolicy } from "@/lib/outreach/types";

// Fixtures verificados via Intl.DateTimeFormat: America/Sao_Paulo é UTC-3 fixo (sem DST desde 2019).
const MONDAY_09H_LOCAL = "2026-01-05T12:00:00.000Z"; // segunda 09:00 local — dentro da janela
const SUNDAY_06H_LOCAL = "2026-01-04T09:00:00.000Z"; // domingo 06:00 local — fora (dia + hora)
const MONDAY_23H_LOCAL = "2026-01-06T02:00:00.000Z"; // segunda 23:00 local — fora (só hora)

describe("isInsideSendingWindow", () => {
  it("segunda 09:00 local está dentro da janela padrão (7h-22h, seg-sáb)", () => {
    expect(isInsideSendingWindow(new Date(MONDAY_09H_LOCAL), DEFAULT_OUTREACH_SENDING_WINDOW)).toBe(true);
  });

  it("domingo está fora — não está em daysOfWeek", () => {
    expect(isInsideSendingWindow(new Date(SUNDAY_06H_LOCAL), DEFAULT_OUTREACH_SENDING_WINDOW)).toBe(false);
  });

  it("segunda 23:00 local está fora — depois de endHour", () => {
    expect(isInsideSendingWindow(new Date(MONDAY_23H_LOCAL), DEFAULT_OUTREACH_SENDING_WINDOW)).toBe(false);
  });
});

describe("calculateNextAllowedSendAt", () => {
  it("já dentro da janela devolve o próprio instante", () => {
    const now = new Date(MONDAY_09H_LOCAL);
    expect(calculateNextAllowedSendAt(now, DEFAULT_OUTREACH_SENDING_WINDOW)).toBe(now.toISOString());
  });

  it("domingo de madrugada avança até segunda 07:00 local", () => {
    const next = calculateNextAllowedSendAt(new Date(SUNDAY_06H_LOCAL), DEFAULT_OUTREACH_SENDING_WINDOW);
    expect(isInsideSendingWindow(new Date(next), DEFAULT_OUTREACH_SENDING_WINDOW)).toBe(true);
    expect(new Date(next).getTime()).toBeGreaterThan(new Date(SUNDAY_06H_LOCAL).getTime());
  });
});

describe("validateSendingWindow", () => {
  it("janela padrão é válida", () => {
    expect(validateSendingWindow(DEFAULT_OUTREACH_SENDING_WINDOW)).toEqual([]);
  });

  it("startHour >= endHour é inválido", () => {
    const window: OutreachSendingWindow = { timezone: "America/Sao_Paulo", daysOfWeek: [1], startHour: 20, endHour: 10 };
    const errors = validateSendingWindow(window);
    expect(errors.some((e) => e.field === "endHour")).toBe(true);
  });

  it("sem dias da semana é inválido", () => {
    const window: OutreachSendingWindow = { timezone: "America/Sao_Paulo", daysOfWeek: [], startHour: 7, endHour: 22 };
    expect(validateSendingWindow(window).some((e) => e.field === "daysOfWeek")).toBe(true);
  });

  it("sem timezone é inválido", () => {
    const window: OutreachSendingWindow = { timezone: "", daysOfWeek: [1], startHour: 7, endHour: 22 };
    expect(validateSendingWindow(window).some((e) => e.field === "timezone")).toBe(true);
  });
});

describe("resolveCampaignSchedule", () => {
  it("insideWindow true quando já dentro", () => {
    const result = resolveCampaignSchedule(
      { window: DEFAULT_OUTREACH_SENDING_WINDOW, timezonePolicy: { timezone: "America/Sao_Paulo", observeHolidays: false } },
      new Date(MONDAY_09H_LOCAL),
    );
    expect(result.insideWindow).toBe(true);
    expect(result.nextAllowedSendAt).toBe(new Date(MONDAY_09H_LOCAL).toISOString());
  });
});

describe("evaluateThrottle", () => {
  const policy: OutreachThrottlingPolicy = { maxPerMinute: 10, maxPerHour: 100, maxPerDay: 1000, minDelaySeconds: 5, maxConcurrent: 1 };

  it("dentro dos limites: allowed true, sem blockers", () => {
    const result = evaluateThrottle(policy, { sentInCurrentMinute: 1, sentInCurrentHour: 1, sentInCurrentDay: 1, concurrentInFlight: 0 });
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("limite por minuto atingido bloqueia", () => {
    const result = evaluateThrottle(policy, { sentInCurrentMinute: 10, sentInCurrentHour: 1, sentInCurrentDay: 1, concurrentInFlight: 0 });
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => b.includes("minuto"))).toBe(true);
  });

  it("concorrência no limite bloqueia", () => {
    const result = evaluateThrottle(policy, { sentInCurrentMinute: 0, sentInCurrentHour: 0, sentInCurrentDay: 0, concurrentInFlight: 1 });
    expect(result.allowed).toBe(false);
  });

  it("perto do limite (>= 80%) gera warning mas ainda permite", () => {
    const result = evaluateThrottle(policy, { sentInCurrentMinute: 8, sentInCurrentHour: 1, sentInCurrentDay: 1, concurrentInFlight: 0 });
    expect(result.allowed).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("calculateThrottleDelay / buildThrottlePreview", () => {
  it("delay é minDelaySeconds + metade do jitter", () => {
    const policy: OutreachThrottlingPolicy = { maxPerMinute: 1, maxPerHour: 1, maxPerDay: 1, minDelaySeconds: 5, maxConcurrent: 1, randomJitterSeconds: 0.8 };
    expect(calculateThrottleDelay(policy)).toBe(5.4);
  });

  it("buildThrottlePreview estima tempo total pra N mensagens", () => {
    const preview = buildThrottlePreview(DEFAULT_OUTREACH_THROTTLING_POLICY);
    expect(preview.estimatedSecondsFor(1)).toBe(0);
    expect(preview.estimatedSecondsFor(11)).toBe(10 * calculateThrottleDelay(DEFAULT_OUTREACH_THROTTLING_POLICY));
  });
});
