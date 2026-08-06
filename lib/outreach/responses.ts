/**
 * Respostas e IA opcional — Outreach & AI Cadence Engine, Foundation v1.
 *
 * `classifyOutreachResponse` é a ÚNICA porta de entrada de classificação —
 * sempre recebe um `ResponseClassifier` injetado (`adapters.ts`), nunca
 * chama IA real diretamente. Opt-out detectado aqui é só uma SUGESTÃO da
 * IA — quem decide de verdade é `consent.ts`/`contacts.is_blocked`
 * (doutrina: "IA nunca envia mensagem diretamente... classificação deve
 * incluir confidence; baixa confiança deve recomendar humano; opt-out deve
 * parar cadência").
 */
import type { ResponseClassifier } from "./adapters";
import { getOutreachResponseClassificationDefinition } from "./catalog";
import type { AIResponseDecision, OutreachResponse } from "./types";

export type ClassifyOutreachResponseInput = {
  response: OutreachResponse;
  classifier: ResponseClassifier;
};

export async function classifyOutreachResponse(input: ClassifyOutreachResponseInput): Promise<AIResponseDecision> {
  return input.classifier.classify(input.response.bodySanitized);
}

export function shouldStopCadenceForClassification(classification: AIResponseDecision["classification"]): boolean {
  return getOutreachResponseClassificationDefinition(classification)?.stopsCadence ?? true;
}

export function applyClassificationToResponse(response: OutreachResponse, decision: AIResponseDecision): OutreachResponse {
  return { ...response, classification: decision.classification, classificationConfidence: decision.confidence };
}
