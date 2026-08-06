/**
 * Handoff humano — Outreach & AI Cadence Engine, Foundation v1.
 *
 * `evaluateHumanHandoff` NUNCA atribui um vendedor de verdade — só produz um
 * `HumanHandoffDecision` (preview). Atribuição real fica pra uma fase
 * futura com integração real ao CRM (`lib/leads`/`lib/agent-engine`).
 */
import type { AIResponseDecision, HumanHandoffDecision, HumanHandoffReason } from "./types";

const REASON_BY_CLASSIFICATION: Partial<Record<AIResponseDecision["classification"], HumanHandoffReason>> = {
  interested: "interested",
  question: "complex_question",
  objection: "objection",
  meeting_request: "interested",
  support_request: "support_request",
  opt_out: "opt_out",
};

export function deriveHandoffReason(decision: AIResponseDecision): HumanHandoffReason | null {
  if (decision.recommendHuman === false) return null;
  if (decision.confidence < 0.5) return "low_confidence";
  return REASON_BY_CLASSIFICATION[decision.classification] ?? null;
}

export function evaluateHumanHandoff(decision: AIResponseDecision, ownerId?: string): HumanHandoffDecision {
  const reason = deriveHandoffReason(decision);
  if (!reason) {
    return { shouldHandoff: false, reason: null, message: "classificação não recomenda transferência — cadência pode continuar." };
  }
  return {
    shouldHandoff: true,
    reason,
    recommendedOwnerId: ownerId,
    message: `transferência recomendada — motivo: "${reason}" (confiança: ${decision.confidence.toFixed(2)}).`,
  };
}

export function transferToOwnerPreview(decision: HumanHandoffDecision, ownerId: string): HumanHandoffDecision {
  return { ...decision, recommendedOwnerId: ownerId };
}

export function deriveRecommendedOwnerAction(decision: HumanHandoffDecision): string {
  if (!decision.shouldHandoff) return "Nenhuma ação — cadência automática pode continuar.";
  switch (decision.reason) {
    case "interested":
      return "Ligar/responder o quanto antes — lead demonstrou interesse.";
    case "complex_question":
      return "Responder a pergunta do contato manualmente.";
    case "objection":
      return "Tratar a objeção comercial diretamente com o contato.";
    case "low_confidence":
      return "Revisar a resposta manualmente — IA não teve confiança suficiente.";
    case "explicit_request":
      return "Atender o pedido explícito do contato.";
    case "support_request":
      return "Encaminhar pro time de suporte.";
    case "opt_out":
      return "Nenhuma ação comercial — respeitar opt-out.";
    case "high_priority":
      return "Priorizar atendimento imediato.";
    case "error":
      return "Investigar erro operacional no enrollment.";
    default:
      return "Revisar manualmente.";
  }
}
