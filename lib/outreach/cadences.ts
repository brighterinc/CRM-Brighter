/**
 * Grafo de cadência e transições de enrollment ligadas à cadência —
 * Outreach & AI Cadence Engine, Foundation v1.
 *
 * `resolveNextCadenceStep`/`calculateNextStepAt` são o núcleo determinístico
 * usado por `enrollments.ts::advanceEnrollment` e por `simulation.ts` — nunca
 * `setTimeout`/cron real, sempre aritmética sobre um `now` explícito.
 *
 * `pauseCadenceEnrollment`/`resumeCadenceEnrollment`/`cancelCadenceEnrollment`/
 * `completeCadenceEnrollment`/`stopCadenceOnReply`/`stopCadenceOnOptOut` são
 * a fonte única de verdade dessas transições — `enrollments.ts` reusa
 * `cancelCadenceEnrollment`/`completeCadenceEnrollment` (nunca duplica).
 */
import { isEnrollmentTransitionValid } from "./status";
import type { EnrollmentStatus, OutreachCadence, OutreachCadenceStep, OutreachEnrollment, OutreachValidationError } from "./types";

/** Etapas ordenadas por `order` — nunca pela ordem de inserção no array. */
export function orderCadenceSteps(cadence: OutreachCadence): OutreachCadenceStep[] {
  return [...cadence.steps].sort((a, b) => a.order - b.order);
}

/**
 * Resolve a PRÓXIMA etapa a partir da atual: segue `onSuccess[0]` se
 * existir; senão cai pra próxima etapa por `order`; senão `null` (fim da
 * cadência). `currentStepId` ausente = primeira etapa ordenada.
 */
export function resolveNextCadenceStep(cadence: OutreachCadence, currentStepId?: string): OutreachCadenceStep | null {
  const ordered = orderCadenceSteps(cadence);
  if (!currentStepId) return ordered[0] ?? null;

  const current = cadence.steps.find((s) => s.id === currentStepId);
  if (!current) return null;

  const branchTargetId = current.onSuccess?.[0];
  if (branchTargetId) {
    return cadence.steps.find((s) => s.id === branchTargetId) ?? null;
  }

  const currentIndex = ordered.findIndex((s) => s.id === currentStepId);
  if (currentIndex === -1) return null;
  return ordered[currentIndex + 1] ?? null;
}

/** ISO-8601 UTC — `now + delaySeconds`. Nunca um sleep real; quem chama de novo mais tarde é quem "avança o relógio" (mesmo padrão de `executeWorkflowRun`). */
export function calculateNextStepAt(now: Date, delaySeconds: number): string {
  return new Date(now.getTime() + Math.max(0, delaySeconds) * 1000).toISOString();
}

export function stopCadenceOnReply(cadence: OutreachCadence): boolean {
  return cadence.stopOnReply;
}

/** Opt-out tem SEMPRE precedência (CLAUDE.md §Consentimento) — `stopOnOptOut: false` na definição é ignorado nesta checagem; a cadência existe pra decidir SE age sobre a resposta, nunca se para ou não no opt-out. */
export function stopCadenceOnOptOut(_cadence: OutreachCadence): true {
  return true;
}

export type EnrollmentTransitionResult = { ok: true; enrollment: OutreachEnrollment } | { ok: false; error: OutreachValidationError };

function transitionEnrollment(enrollment: OutreachEnrollment, to: EnrollmentStatus, patch: Partial<OutreachEnrollment> = {}): EnrollmentTransitionResult {
  if (!isEnrollmentTransitionValid(enrollment.status, to)) {
    return { ok: false, error: { field: "status", message: `transição inválida: "${enrollment.status}" → "${to}"` } };
  }
  return { ok: true, enrollment: { ...enrollment, ...patch, status: to, updatedAt: new Date().toISOString() } };
}

export function pauseCadenceEnrollment(enrollment: OutreachEnrollment): EnrollmentTransitionResult {
  return transitionEnrollment(enrollment, "waiting");
}

export function resumeCadenceEnrollment(enrollment: OutreachEnrollment): EnrollmentTransitionResult {
  return transitionEnrollment(enrollment, "active");
}

export function cancelCadenceEnrollment(enrollment: OutreachEnrollment): EnrollmentTransitionResult {
  return transitionEnrollment(enrollment, "cancelled");
}

export function completeCadenceEnrollment(enrollment: OutreachEnrollment, now: string = new Date().toISOString()): EnrollmentTransitionResult {
  return transitionEnrollment(enrollment, "completed", { lastInteractionAt: now });
}
