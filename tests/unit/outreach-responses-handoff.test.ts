import { describe, expect, it } from "vitest";

import { FakeResponseClassifier, FakeResponseDraftGenerator, NoopResponseClassifier, NoopResponseDraftGenerator } from "@/lib/outreach/adapters";
import { deriveHandoffReason, deriveRecommendedOwnerAction, evaluateHumanHandoff, transferToOwnerPreview } from "@/lib/outreach/handoff";
import { applyClassificationToResponse, classifyOutreachResponse, shouldStopCadenceForClassification } from "@/lib/outreach/responses";
import type { AIResponseDecision, OutreachResponse } from "@/lib/outreach/types";

function response(overrides: Partial<OutreachResponse> = {}): OutreachResponse {
  return {
    id: "resp-1",
    enrollmentId: "enr-1",
    contactId: "c1",
    bodySanitized: "",
    receivedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("NoopResponseClassifier / NoopResponseDraftGenerator", () => {
  it("classificador noop nunca classifica de verdade, sempre recomenda humano", async () => {
    const decision = await new NoopResponseClassifier().classify("qualquer coisa");
    expect(decision.classification).toBe("unknown");
    expect(decision.recommendHuman).toBe(true);
  });

  it("gerador de rascunho noop sempre recusa (no_capability)", async () => {
    const result = await new NoopResponseDraftGenerator().draft("oi");
    expect(result).toEqual({ ok: false, reason: "no_capability" });
  });
});

describe("FakeResponseClassifier", () => {
  const classifier = new FakeResponseClassifier();

  it("detecta STOP/PARAR como opt_out com alta confiança e NÃO recomenda humano (opt-out não é ação comercial)", async () => {
    const decision = await classifier.classify("PARAR");
    expect(decision.classification).toBe("opt_out");
    expect(decision.confidence).toBeGreaterThan(0.9);
    expect(decision.recommendHuman).toBe(false);
  });

  it("detecta interesse explícito", async () => {
    const decision = await classifier.classify("Fiquei muito interessada nisso, adorei a proposta!");
    expect(decision.classification).toBe("interested");
  });

  it("detecta pedido de reunião", async () => {
    const decision = await classifier.classify("Podemos agendar uma reunião essa semana?");
    expect(decision.classification).toBe("meeting_request");
  });

  it("mensagem ambígua vira unknown com confiança baixa e recomenda humano", async () => {
    const decision = await classifier.classify("hmm");
    expect(decision.classification).toBe("unknown");
    expect(decision.confidence).toBeLessThan(0.5);
    expect(decision.recommendHuman).toBe(true);
  });

  it("é determinístico — mesma entrada, mesma saída", async () => {
    const a = await classifier.classify("Achei muito caro, não tenho orçamento pra isso agora.");
    const b = await classifier.classify("Achei muito caro, não tenho orçamento pra isso agora.");
    expect(a).toEqual(b);
  });
});

describe("FakeResponseDraftGenerator", () => {
  it("gera rascunho não-vazio, nunca marcado como enviado", async () => {
    const result = await new FakeResponseDraftGenerator().draft("Tenho uma dúvida", "Carlos");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft).toContain("Carlos");
    expect(result.draft).toContain("simulado");
  });

  it("corpo vazio devolve reason empty", async () => {
    const result = await new FakeResponseDraftGenerator().draft("");
    expect(result).toEqual({ ok: false, reason: "empty" });
  });
});

describe("classifyOutreachResponse", () => {
  it("delega inteiramente ao classifier injetado", async () => {
    const decision = await classifyOutreachResponse({ response: response({ bodySanitized: "PARAR" }), classifier: new FakeResponseClassifier() });
    expect(decision.classification).toBe("opt_out");
  });
});

describe("shouldStopCadenceForClassification / applyClassificationToResponse", () => {
  it("interested para a cadência (consulta o catálogo, não reimplementa)", () => {
    expect(shouldStopCadenceForClassification("interested")).toBe(true);
  });

  it("applyClassificationToResponse anexa classification/confidence à resposta", () => {
    const decision: AIResponseDecision = { classification: "objection", confidence: 0.7, recommendHuman: true, reasoning: "teste" };
    const result = applyClassificationToResponse(response(), decision);
    expect(result.classification).toBe("objection");
    expect(result.classificationConfidence).toBe(0.7);
  });
});

describe("deriveHandoffReason", () => {
  it("recommendHuman false nunca gera motivo de handoff", () => {
    const decision: AIResponseDecision = { classification: "interested", confidence: 0.9, recommendHuman: false, reasoning: "" };
    expect(deriveHandoffReason(decision)).toBeNull();
  });

  it("confiança baixa SEMPRE vira low_confidence, mesmo com classificação definida", () => {
    const decision: AIResponseDecision = { classification: "interested", confidence: 0.3, recommendHuman: true, reasoning: "" };
    expect(deriveHandoffReason(decision)).toBe("low_confidence");
  });

  it("meeting_request mapeia pra interested", () => {
    const decision: AIResponseDecision = { classification: "meeting_request", confidence: 0.9, recommendHuman: true, reasoning: "" };
    expect(deriveHandoffReason(decision)).toBe("interested");
  });
});

describe("evaluateHumanHandoff", () => {
  it("opt_out nunca recomenda handoff comercial (mesmo tendo um motivo)", () => {
    const decision: AIResponseDecision = { classification: "opt_out", confidence: 0.99, recommendHuman: false, reasoning: "" };
    const result = evaluateHumanHandoff(decision);
    expect(result.shouldHandoff).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("interessado recomenda handoff com motivo interested", () => {
    const decision: AIResponseDecision = { classification: "interested", confidence: 0.8, recommendHuman: true, reasoning: "" };
    const result = evaluateHumanHandoff(decision, "owner-1");
    expect(result.shouldHandoff).toBe(true);
    expect(result.reason).toBe("interested");
  });
});

describe("transferToOwnerPreview / deriveRecommendedOwnerAction", () => {
  it("transferToOwnerPreview só anexa recommendedOwnerId, nunca atribui de verdade", () => {
    const decision = evaluateHumanHandoff({ classification: "interested", confidence: 0.8, recommendHuman: true, reasoning: "" });
    const result = transferToOwnerPreview(decision, "owner-2");
    expect(result.recommendedOwnerId).toBe("owner-2");
    expect(result.shouldHandoff).toBe(decision.shouldHandoff);
  });

  it("deriveRecommendedOwnerAction sem handoff sugere nenhuma ação", () => {
    const decision = evaluateHumanHandoff({ classification: "not_interested", confidence: 0.9, recommendHuman: false, reasoning: "" });
    expect(deriveRecommendedOwnerAction(decision)).toMatch(/[Nn]enhuma ação/);
  });

  it("deriveRecommendedOwnerAction pra opt_out nunca sugere ação comercial", () => {
    const forcedOptOut = { shouldHandoff: true, reason: "opt_out" as const, message: "" };
    expect(deriveRecommendedOwnerAction(forcedOptOut)).toMatch(/opt-out/);
  });
});
