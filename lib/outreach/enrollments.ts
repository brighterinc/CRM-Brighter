/**
 * Ciclo de vida de enrollment (inscrição de um contato numa campanha) —
 * Outreach & AI Cadence Engine, Foundation v1.
 *
 * Idempotência: `idempotencyKey` (formato `campaignId:contactId`, ver
 * `types.ts`) é conferida contra os enrollments já existentes ANTES de criar
 * um novo — mesma ideia do `unique(organization_id, external_id)`/
 * `Idempotency-Key` reais (CLAUDE.md), modelada em memória. Opt-out
 * (`contact.isBlocked`) SEMPRE bloqueia a criação — nunca contornável.
 *
 * `cancelEnrollment`/`completeEnrollment` reusam `cancelCadenceEnrollment`/
 * `completeCadenceEnrollment` (`cadences.ts`) — nunca duplicam a checagem de
 * transição.
 */
import { cancelCadenceEnrollment, completeCadenceEnrollment, resolveNextCadenceStep, calculateNextStepAt } from "./cadences";
import type { EnrollmentTransitionResult } from "./cadences";
import { isEnrollmentTransitionValid } from "./status";
import type { EnrollmentStatus, HumanHandoffReason, OutreachCadence, OutreachEnrollment, OutreachSyntheticContact, OutreachValidationError, ResponseClassification } from "./types";

export type CreateEnrollmentInput = {
  campaignId: string;
  cadenceId: string;
  contact: OutreachSyntheticContact;
  leadId?: string;
  existingEnrollments: OutreachEnrollment[];
};

export type CreateEnrollmentResult = { ok: true; enrollment: OutreachEnrollment } | { ok: false; error: OutreachValidationError };

function buildIdempotencyKey(campaignId: string, contactId: string): string {
  return `${campaignId}:${contactId}`;
}

export function createEnrollment(input: CreateEnrollmentInput): CreateEnrollmentResult {
  const { campaignId, cadenceId, contact, leadId, existingEnrollments } = input;

  if (contact.isBlocked) {
    return { ok: false, error: { field: "contactId", message: `contato "${contact.id}" está bloqueado (opt-out) — inscrição negada` } };
  }

  const idempotencyKey = buildIdempotencyKey(campaignId, contact.id);
  const duplicate = existingEnrollments.find((e) => e.idempotencyKey === idempotencyKey);
  if (duplicate) {
    return { ok: false, error: { field: "idempotencyKey", message: `contato "${contact.id}" já está inscrito na campanha "${campaignId}" (enrollment "${duplicate.id}")` } };
  }

  const now = new Date().toISOString();
  const enrollment: OutreachEnrollment = {
    id: crypto.randomUUID(),
    campaignId,
    cadenceId,
    contactId: contact.id,
    leadId,
    ownerId: contact.ownerUserId ?? undefined,
    status: "pending",
    idempotencyKey,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  return { ok: true, enrollment };
}

function transition(enrollment: OutreachEnrollment, to: EnrollmentStatus, patch: Partial<OutreachEnrollment> = {}): EnrollmentTransitionResult {
  if (!isEnrollmentTransitionValid(enrollment.status, to)) {
    return { ok: false, error: { field: "status", message: `transição inválida: "${enrollment.status}" → "${to}"` } };
  }
  return { ok: true, enrollment: { ...enrollment, ...patch, status: to, updatedAt: new Date().toISOString() } };
}

export function activateEnrollment(enrollment: OutreachEnrollment, cadence: OutreachCadence, now: Date = new Date()): EnrollmentTransitionResult {
  const firstStep = resolveNextCadenceStep(cadence);
  if (!firstStep) {
    return { ok: false, error: { field: "cadenceId", message: `cadência "${cadence.id}" não tem nenhuma etapa` } };
  }
  return transition(enrollment, "active", {
    currentStepId: firstStep.id,
    nextStepAt: firstStep.delaySeconds ? calculateNextStepAt(now, firstStep.delaySeconds) : now.toISOString(),
  });
}

export type AdvanceEnrollmentResult = EnrollmentTransitionResult;

/**
 * Avança o enrollment pra próxima etapa da cadência (nunca reexecuta a etapa
 * atual — idempotência de etapa, mesmo espírito de `executeWorkflowRun`).
 * Sem próxima etapa → `completed`.
 */
export function advanceEnrollment(enrollment: OutreachEnrollment, cadence: OutreachCadence, now: Date = new Date()): AdvanceEnrollmentResult {
  if (enrollment.status !== "active" && enrollment.status !== "waiting") {
    return { ok: false, error: { field: "status", message: `enrollment "${enrollment.id}" não pode avançar a partir de "${enrollment.status}"` } };
  }

  const next = resolveNextCadenceStep(cadence, enrollment.currentStepId);
  if (!next) {
    return completeCadenceEnrollment(enrollment, now.toISOString());
  }

  return transition(enrollment, "active", {
    currentStepId: next.id,
    nextStepAt: next.delaySeconds ? calculateNextStepAt(now, next.delaySeconds) : now.toISOString(),
    attempts: enrollment.attempts + 1,
  });
}

export function markEnrollmentResponded(enrollment: OutreachEnrollment, classification: ResponseClassification, now: string = new Date().toISOString()): EnrollmentTransitionResult {
  return transition(enrollment, "responded", { responseClassification: classification, lastInteractionAt: now });
}

export function qualifyEnrollment(enrollment: OutreachEnrollment): EnrollmentTransitionResult {
  return transition(enrollment, "qualified");
}

export function transferEnrollmentToHuman(enrollment: OutreachEnrollment, ownerId?: string): EnrollmentTransitionResult {
  return transition(enrollment, "transferred", { ownerId: ownerId ?? enrollment.ownerId });
}

export function failEnrollment(enrollment: OutreachEnrollment, reason: string): EnrollmentTransitionResult {
  return transition(enrollment, "failed", { lastError: reason });
}

export function optOutEnrollment(enrollment: OutreachEnrollment, now: string = new Date().toISOString()): EnrollmentTransitionResult {
  return transition(enrollment, "opted_out", { lastInteractionAt: now });
}

export function cancelEnrollment(enrollment: OutreachEnrollment): EnrollmentTransitionResult {
  return cancelCadenceEnrollment(enrollment);
}

export function completeEnrollment(enrollment: OutreachEnrollment, now?: string): EnrollmentTransitionResult {
  return completeCadenceEnrollment(enrollment, now);
}

export type { HumanHandoffReason };
