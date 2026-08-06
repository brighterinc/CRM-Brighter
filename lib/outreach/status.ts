/**
 * Tabelas de transição de estado da Outreach & AI Cadence Engine —
 * Foundation v1. Cada `*_TRANSITIONS` é a fonte única de verdade de "quais
 * transições são válidas" — `campaigns.ts`/`cadences.ts`/`enrollments.ts`
 * consultam estas tabelas, nunca reimplementam a checagem inline.
 */
import type { CadenceStatus, CampaignStatus, DeliveryStatus, EnrollmentStatus } from "./types";

export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["scheduled", "cancelled", "archived"],
  scheduled: ["active", "cancelled", "blocked", "draft"],
  active: ["paused", "completed", "cancelled", "blocked"],
  paused: ["active", "cancelled", "archived"],
  completed: ["archived"],
  cancelled: ["archived"],
  blocked: ["draft", "cancelled", "archived"],
  archived: [],
};

export const CADENCE_TRANSITIONS: Record<CadenceStatus, CadenceStatus[]> = {
  draft: ["active", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "cancelled"],
  completed: [],
  cancelled: [],
};

export const ENROLLMENT_TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  // `pending → active` é direto (mesmo padrão de `activateEnrollment` chamado
  // logo após `createEnrollment` na simulação/CLI) — `scheduled` é um estado
  // intermediário OPCIONAL, nunca obrigatório.
  pending: ["scheduled", "active", "cancelled", "blocked", "opted_out", "failed"],
  scheduled: ["active", "cancelled", "blocked", "opted_out", "failed"],
  active: ["waiting", "responded", "completed", "cancelled", "opted_out", "blocked", "failed"],
  waiting: ["active", "responded", "completed", "cancelled", "opted_out", "blocked", "failed"],
  responded: ["qualified", "transferred", "active", "completed", "cancelled", "opted_out"],
  qualified: ["transferred", "completed", "cancelled"],
  transferred: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  opted_out: [],
  blocked: [],
  failed: [],
};

export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ["scheduled", "skipped", "blocked", "cancelled"],
  scheduled: ["simulated", "skipped", "blocked", "cancelled", "failed"],
  simulated: ["sent", "failed"],
  sent: ["delivered", "failed"],
  delivered: ["read", "replied"],
  read: ["replied"],
  replied: [],
  failed: ["scheduled"],
  skipped: [],
  blocked: [],
  cancelled: [],
};

/** Estados terminais — uma vez alcançados, nenhuma transição sai deles (exceto o próprio Set de destino vazio já garantir isso; usado por validação e resumo). */
export const TERMINAL_CAMPAIGN_STATUSES = new Set<CampaignStatus>(["archived"]);
export const TERMINAL_CADENCE_STATUSES = new Set<CadenceStatus>(["completed", "cancelled"]);
export const TERMINAL_ENROLLMENT_STATUSES = new Set<EnrollmentStatus>(["completed", "cancelled", "opted_out", "blocked", "failed"]);
export const TERMINAL_DELIVERY_STATUSES = new Set<DeliveryStatus>(["delivered", "read", "replied", "skipped", "blocked", "cancelled"]);

/**
 * `from === to` só é válido quando `from` NÃO é terminal — senão reinvocar a
 * mesma ação sobre um estado terminal (ex.: completar um enrollment já
 * `completed`) passaria por engano, violando "impedir avanço após
 * conclusão" (seção 12 do domínio).
 */
function buildTransitionChecker<T extends string>(table: Record<T, T[]>, terminal: Set<T>) {
  return (from: T, to: T): boolean => (from === to && !terminal.has(from)) || table[from].includes(to);
}

export const isCampaignTransitionValid = buildTransitionChecker(CAMPAIGN_TRANSITIONS, TERMINAL_CAMPAIGN_STATUSES);
export const isCadenceTransitionValid = buildTransitionChecker(CADENCE_TRANSITIONS, TERMINAL_CADENCE_STATUSES);
export const isEnrollmentTransitionValid = buildTransitionChecker(ENROLLMENT_TRANSITIONS, TERMINAL_ENROLLMENT_STATUSES);
export const isDeliveryTransitionValid = buildTransitionChecker(DELIVERY_TRANSITIONS, TERMINAL_DELIVERY_STATUSES);
