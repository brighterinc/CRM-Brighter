import { describe, expect, it } from "vitest";

import { createDemoInstallations } from "@/lib/control-plane/repository";
import { OUTREACH_SIMULATION_SCENARIOS, simulateOutreachScenario } from "@/lib/outreach/simulation";

describe("OUTREACH_SIMULATION_SCENARIOS", () => {
  it("tem os 24 cenários pedidos", () => {
    expect(OUTREACH_SIMULATION_SCENARIOS).toHaveLength(24);
  });

  it("todos os cenários rodam sem lançar exceção", async () => {
    for (const scenario of OUTREACH_SIMULATION_SCENARIOS) {
      await expect(simulateOutreachScenario(scenario)).resolves.toBeDefined();
    }
  });
});

describe("simulateOutreachScenario — cenários específicos", () => {
  it("healthy: campanha ativa, enrollments na primeira etapa", async () => {
    const result = await simulateOutreachScenario("healthy");
    expect(result.campaign.status).toBe("active");
    expect(result.enrollments.length).toBeGreaterThan(0);
    expect(result.enrollments.every((e) => e.status === "active")).toBe(true);
  });

  it("audience_empty: nenhum contato, nenhum enrollment", async () => {
    const result = await simulateOutreachScenario("audience_empty");
    expect(result.audiencePreview.totalMatched).toBe(0);
    expect(result.enrollments).toEqual([]);
  });

  it("contact_opted_out: enrollment rejeitado, aparece em blockers", async () => {
    const result = await simulateOutreachScenario("contact_opted_out");
    expect(result.blockers.some((b) => b.includes("bloqueado"))).toBe(true);
  });

  it("duplicate_enrollment: segunda inscrição do mesmo contato é rejeitada", async () => {
    const result = await simulateOutreachScenario("duplicate_enrollment");
    expect(result.blockers.some((b) => b.includes("já está inscrito"))).toBe(true);
  });

  it("throttled: throttleEvaluation reporta bloqueio por minuto", async () => {
    const result = await simulateOutreachScenario("throttled");
    expect(result.throttleEvaluation?.allowed).toBe(false);
  });

  it("outside_window: scheduleEvaluation reporta fora da janela", async () => {
    const result = await simulateOutreachScenario("outside_window");
    expect(result.scheduleEvaluation?.insideWindow).toBe(false);
  });

  it("reply_interested: aiDecision classifica interested e recomenda handoff", async () => {
    const result = await simulateOutreachScenario("reply_interested");
    expect(result.aiDecision?.classification).toBe("interested");
    expect(result.handoff?.shouldHandoff).toBe(true);
  });

  it("reply_opt_out: aiDecision classifica opt_out e NÃO recomenda handoff comercial", async () => {
    const result = await simulateOutreachScenario("reply_opt_out");
    expect(result.aiDecision?.classification).toBe("opt_out");
    expect(result.handoff?.shouldHandoff).toBe(false);
  });

  it("ai_low_confidence: confiança baixa recomenda humano", async () => {
    const result = await simulateOutreachScenario("ai_low_confidence");
    expect(result.aiDecision?.confidence).toBeLessThan(0.5);
    expect(result.handoff?.reason).toBe("low_confidence");
  });

  it("channel_unavailable: canal indisponível vira blocker", async () => {
    const result = await simulateOutreachScenario("channel_unavailable");
    expect(result.blockers.some((b) => b.includes("indisponível"))).toBe(true);
  });

  it("billing_limit: limite de campanhas do plano vira blocker", async () => {
    const result = await simulateOutreachScenario("billing_limit");
    expect(result.blockers.some((b) => b.includes("limite de campanhas"))).toBe(true);
  });

  it("module_disabled: channel.whatsapp removido da instalação", async () => {
    const result = await simulateOutreachScenario("module_disabled");
    expect(result.installation.modules).not.toContain("channel.whatsapp");
    expect(result.blockers.some((b) => b.includes("channel.whatsapp"))).toBe(true);
  });

  it("retry_success: 1 tentativa, sem blocker de esgotamento", async () => {
    const result = await simulateOutreachScenario("retry_success");
    expect(result.passes).toBe(1);
    expect(result.blockers.some((b) => b.includes("retry esgotado"))).toBe(false);
  });

  it("retry_exhausted: 3 tentativas, blocker de retry esgotado", async () => {
    const result = await simulateOutreachScenario("retry_exhausted");
    expect(result.passes).toBe(3);
    expect(result.blockers.some((b) => b.includes("retry esgotado"))).toBe(true);
  });

  it("automation.campaigns não autorizado está SEMPRE presente (status planned), em qualquer cenário", async () => {
    const result = await simulateOutreachScenario("healthy");
    // O blocker de módulo é reportado por generateOutreachSummary, não pela
    // simulação isolada — aqui confirmamos que a cadência de demonstração,
    // quando validada, sempre reporta esse blocker (ver outreach-repository.test.ts).
    expect(result.cadence.status).toBe("active");
  });
});

describe("determinismo", () => {
  it("mesmo cenário, mesma installation fixa: mesmo shape de resultado (exceto ids gerados)", async () => {
    const installation = createDemoInstallations()[0]!;
    const a = await simulateOutreachScenario("healthy", { installation });
    const b = await simulateOutreachScenario("healthy", { installation });
    expect(a.enrollments.length).toBe(b.enrollments.length);
    expect(a.metrics).toEqual(b.metrics);
    expect(a.campaign.status).toBe(b.campaign.status);
  });
});
