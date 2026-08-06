/**
 * Janela de envio e agendamento — Outreach & AI Cadence Engine, Foundation
 * v1. Datas sempre recebidas como parâmetro (`now: Date`) — nunca
 * `Date.now()` implícito, nunca timer/cron real. Feriados não são
 * implementados nesta Foundation (`OutreachTimezonePolicy.observeHolidays`
 * é sempre `false`).
 *
 * Conversão de timezone usa `Intl.DateTimeFormat` (Node/browser nativo) —
 * nunca uma lib externa nem tabela de offset hardcoded.
 */
import type { OutreachSchedule, OutreachSendingWindow, OutreachValidationError, OutreachWeekday } from "./types";

function getLocalPartsInTimezone(date: Date, timezone: string): { weekday: OutreachWeekday; hour: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";

  const WEEKDAY_MAP: Record<string, OutreachWeekday> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // `hour12: false` no Node pode devolver "24" pra meia-noite — normaliza pra 0.
  const hour = Number.parseInt(hourStr, 10) % 24;

  return { weekday: WEEKDAY_MAP[weekdayShort] ?? 0, hour };
}

export function isInsideSendingWindow(now: Date, window: OutreachSendingWindow): boolean {
  const { weekday, hour } = getLocalPartsInTimezone(now, window.timezone);
  if (!window.daysOfWeek.includes(weekday)) return false;
  return hour >= window.startHour && hour < window.endHour;
}

/** Próximo instante (ISO-8601 UTC) dentro da janela — avança hora a hora até achar um horário válido (teto de 14 dias, nunca loop infinito). */
export function calculateNextAllowedSendAt(now: Date, window: OutreachSendingWindow): string {
  const MAX_HOURS = 24 * 14;
  let candidate = new Date(now.getTime());
  for (let i = 0; i < MAX_HOURS; i++) {
    if (isInsideSendingWindow(candidate, window)) return candidate.toISOString();
    candidate = new Date(candidate.getTime() + 60 * 60 * 1000);
  }
  return candidate.toISOString();
}

export function validateSendingWindow(window: OutreachSendingWindow): OutreachValidationError[] {
  const errors: OutreachValidationError[] = [];
  if (window.daysOfWeek.length === 0) errors.push({ field: "daysOfWeek", message: "janela de envio precisa de pelo menos um dia da semana" });
  if (window.startHour < 0 || window.startHour > 23) errors.push({ field: "startHour", message: "startHour precisa estar entre 0 e 23" });
  if (window.endHour < 1 || window.endHour > 24) errors.push({ field: "endHour", message: "endHour precisa estar entre 1 e 24" });
  if (window.startHour >= window.endHour) errors.push({ field: "endHour", message: "endHour precisa ser maior que startHour" });
  if (!window.timezone) errors.push({ field: "timezone", message: "timezone é obrigatório (ex.: America/Sao_Paulo)" });
  return errors;
}

export function resolveCampaignSchedule(schedule: OutreachSchedule, now: Date): { insideWindow: boolean; nextAllowedSendAt: string } {
  const insideWindow = isInsideSendingWindow(now, schedule.window);
  return {
    insideWindow,
    nextAllowedSendAt: insideWindow ? now.toISOString() : calculateNextAllowedSendAt(now, schedule.window),
  };
}

/** Janela padrão de referência — 7h-22h todos os dias exceto domingo, mesma doutrina de CLAUDE.md §WAHA ("Janela 7h-22h, evitar domingo"). */
export const DEFAULT_OUTREACH_SENDING_WINDOW: OutreachSendingWindow = {
  timezone: "America/Sao_Paulo",
  daysOfWeek: [1, 2, 3, 4, 5, 6],
  startHour: 7,
  endHour: 22,
};
