/**
 * Consentimento e elegibilidade — Outreach & AI Cadence Engine, Foundation
 * v1.
 *
 * Espelha (nunca contradiz) os sinais reais de produção:
 * `contacts.is_blocked`+`blocked_reason` (irrevogável, STOP-detection —
 * `lib/waha/ingest.ts`) e `contacts.consent` jsonb
 * (`{marketing,transactional,profiling}`). Nenhuma regra jurídica nova é
 * inventada aqui — validação legal real depende da operação/jurisdição do
 * tenant (ver `docs/outreach/audience-and-consent.md`). Opt-out sempre tem
 * precedência sobre qualquer outra regra.
 */
import type { OutreachChannel, OutreachComplianceEvaluation, OutreachSyntheticContact } from "./types";

const LEGAL_BASIS_NOTE =
  "Esta Foundation só representa ESTADOS de consentimento/opt-out em memória — a validação jurídica real (base legal LGPD, jurisdição, finalidade) depende da operação de cada tenant e não é decidida por este engine.";

export function evaluateContactEligibility(contact: OutreachSyntheticContact, channel: OutreachChannel): OutreachComplianceEvaluation {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (contact.isBlocked) {
    blockers.push(`contato "${contact.id}" está bloqueado${contact.blockedReason ? ` (motivo: "${contact.blockedReason}")` : ""} — opt-out tem precedência sobre qualquer envio`);
  }
  if (channel !== "internal" && !contact.consent.marketing?.granted) {
    blockers.push(`contato "${contact.id}" sem consentimento de marketing registrado`);
  }
  if (channel === "whatsapp" || channel === "sms") {
    if (!contact.phoneNumber) blockers.push(`contato "${contact.id}" sem telefone cadastrado pro canal "${channel}"`);
  }
  if (channel === "email" && !contact.email) {
    blockers.push(`contato "${contact.id}" sem e-mail cadastrado`);
  }
  if (contact.consent.marketing?.granted && !contact.consent.marketing.grantedAt) {
    warnings.push(`contato "${contact.id}" tem consentimento de marketing sem data de concessão registrada`);
  }

  return { eligible: blockers.length === 0, blockers, warnings, legalBasisNote: LEGAL_BASIS_NOTE };
}

export type RegisterOptOutPreviewResult = { contactId: string; blockedReason: string; irrevocable: true };

/** Preview de opt-out — NUNCA escreve em `contacts.is_blocked` de verdade (isso é responsabilidade da tabela real/`lib/waha/ingest.ts`). Só modela o efeito esperado. */
export function registerOptOutPreview(contactId: string, reasonId: string): RegisterOptOutPreviewResult {
  return { contactId, blockedReason: reasonId, irrevocable: true };
}

export function applySuppressionRules(contacts: OutreachSyntheticContact[], channel: OutreachChannel): { suppressed: string[]; allowed: string[] } {
  const suppressed: string[] = [];
  const allowed: string[] = [];
  for (const contact of contacts) {
    const evaluation = evaluateContactEligibility(contact, channel);
    (evaluation.eligible ? allowed : suppressed).push(contact.id);
  }
  return { suppressed, allowed };
}

export function deriveComplianceBlockers(evaluations: OutreachComplianceEvaluation[]): string[] {
  return evaluations.flatMap((e) => e.blockers);
}

export function deriveComplianceWarnings(evaluations: OutreachComplianceEvaluation[]): string[] {
  return evaluations.flatMap((e) => e.warnings);
}
