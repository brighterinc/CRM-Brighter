import { describe, expect, it } from "vitest";

import { calculateNextStepAt, cancelCadenceEnrollment, completeCadenceEnrollment, resolveNextCadenceStep, orderCadenceSteps, stopCadenceOnOptOut, stopCadenceOnReply } from "@/lib/outreach/cadences";
import { activateEnrollment, advanceEnrollment, createEnrollment, failEnrollment, markEnrollmentResponded, optOutEnrollment, qualifyEnrollment, transferEnrollmentToHuman } from "@/lib/outreach/enrollments";
import { detectCircularCadenceSteps, validateCadence } from "@/lib/outreach/validation";
import type { OutreachCadence, OutreachCadenceStep, OutreachEnrollment, OutreachSyntheticContact } from "@/lib/outreach/types";

function step(overrides: Partial<OutreachCadenceStep> & { id: string; order: number }): OutreachCadenceStep {
  return { name: overrides.id, type: "delay", configuration: {}, ...overrides };
}

function cadence(steps: OutreachCadenceStep[], overrides: Partial<OutreachCadence> = {}): OutreachCadence {
  return {
    id: "cad-1",
    name: "Cadência teste",
    status: "active",
    channel: "whatsapp",
    steps,
    stopOnReply: true,
    stopOnOptOut: true,
    timezone: "America/Sao_Paulo",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function contact(overrides: Partial<OutreachSyntheticContact> & { id: string }): OutreachSyntheticContact {
  return {
    name: "Nome",
    phoneNumber: "+5511999999999",
    email: "a@b.invalid",
    tags: [],
    customFields: {},
    isBlocked: false,
    blockedReason: null,
    consent: { marketing: { granted: true } },
    ownerUserId: null,
    ...overrides,
  };
}

describe("orderCadenceSteps", () => {
  it("ordena por order, não pela ordem de inserção no array", () => {
    const c = cadence([step({ id: "b", order: 1 }), step({ id: "a", order: 0 }), step({ id: "c", order: 2 })]);
    expect(orderCadenceSteps(c).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});

describe("resolveNextCadenceStep", () => {
  // Grafo linear a(0) → b(1) → c(2), sem branch — testa a queda pra
  // "próxima etapa por order" quando não há onSuccess.
  const linear = cadence([step({ id: "a", order: 0 }), step({ id: "b", order: 1 }), step({ id: "c", order: 2 })]);

  it("sem currentStepId devolve a primeira etapa ordenada", () => {
    expect(resolveNextCadenceStep(linear)?.id).toBe("a");
  });

  it("sem onSuccess cai pra próxima etapa por order", () => {
    expect(resolveNextCadenceStep(linear, "a")?.id).toBe("b");
  });

  it("última etapa devolve null (fim da cadência)", () => {
    expect(resolveNextCadenceStep(linear, "c")).toBeNull();
  });

  it("segue onSuccess[0] quando presente, ignorando a ordem sequencial", () => {
    // a(0) pula direto pra c(2) via branch — b(1) nunca é alcançada por essa aresta.
    const branched = cadence([step({ id: "a", order: 0, onSuccess: ["c"] }), step({ id: "b", order: 1 }), step({ id: "c", order: 2 })]);
    expect(resolveNextCadenceStep(branched, "a")?.id).toBe("c");
  });
});

describe("calculateNextStepAt", () => {
  it("soma delaySeconds ao now, nunca usa Date.now() implícito", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(calculateNextStepAt(now, 120)).toBe("2026-01-01T00:02:00.000Z");
  });

  it("delay negativo é tratado como zero", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(calculateNextStepAt(now, -10)).toBe(now.toISOString());
  });
});

describe("stopCadenceOnReply / stopCadenceOnOptOut", () => {
  it("stopCadenceOnReply reflete a configuração da cadência", () => {
    expect(stopCadenceOnReply(cadence([step({ id: "a", order: 0 })], { stopOnReply: false }))).toBe(false);
  });

  it("stopCadenceOnOptOut é sempre true — opt-out tem precedência incondicional", () => {
    expect(stopCadenceOnOptOut(cadence([step({ id: "a", order: 0 })], { stopOnOptOut: false }))).toBe(true);
  });
});

describe("detectCircularCadenceSteps", () => {
  it("grafo sem ciclo devolve null", () => {
    const steps = [step({ id: "a", order: 0, onSuccess: ["b"] }), step({ id: "b", order: 1 })];
    expect(detectCircularCadenceSteps(steps)).toBeNull();
  });

  it("grafo com ciclo devolve o caminho do ciclo", () => {
    const steps = [step({ id: "a", order: 0, onSuccess: ["b"] }), step({ id: "b", order: 1, onSuccess: ["a"] })];
    expect(detectCircularCadenceSteps(steps)).not.toBeNull();
  });
});

describe("validateCadence", () => {
  it("cadência sem etapas é inválida", () => {
    const errors = validateCadence({ cadence: cadence([]), enabledModuleIds: ["automation.campaigns"], deploymentPlan: "dedicated" });
    expect(errors.some((e) => e.field === "steps")).toBe(true);
  });

  it("etapa message sem templateId é inválida", () => {
    const c = cadence([step({ id: "a", order: 0, type: "message" })]);
    const errors = validateCadence({ cadence: c, enabledModuleIds: ["automation.campaigns"], deploymentPlan: "dedicated" });
    expect(errors.some((e) => e.field === "steps[a].templateId")).toBe(true);
  });

  it("automation.campaigns nunca autorizado (status planned) — sempre reporta blocker mesmo com o módulo na lista habilitada", () => {
    const c = cadence([step({ id: "a", order: 0, type: "delay", delaySeconds: 10 })]);
    const errors = validateCadence({ cadence: c, enabledModuleIds: ["automation.campaigns"], deploymentPlan: "dedicated" });
    expect(errors.some((e) => e.message.includes("automation.campaigns"))).toBe(true);
  });

  it("delaySeconds negativo é inválido", () => {
    const c = cadence([step({ id: "a", order: 0, type: "delay", delaySeconds: -5 })]);
    const errors = validateCadence({ cadence: c, enabledModuleIds: [], deploymentPlan: "dedicated" });
    expect(errors.some((e) => e.field === "steps[a].delaySeconds")).toBe(true);
  });

  it("referência onSuccess pra etapa inexistente é inválida", () => {
    const c = cadence([step({ id: "a", order: 0, onSuccess: ["inexistente"] })]);
    const errors = validateCadence({ cadence: c, enabledModuleIds: [], deploymentPlan: "dedicated" });
    expect(errors.some((e) => e.field.includes("onSuccess"))).toBe(true);
  });
});

describe("createEnrollment", () => {
  const c1 = contact({ id: "c1" });

  it("cria enrollment pending com idempotencyKey campanha:contato", () => {
    const result = createEnrollment({ campaignId: "camp-1", cadenceId: "cad-1", contact: c1, existingEnrollments: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enrollment.status).toBe("pending");
    expect(result.enrollment.idempotencyKey).toBe("camp-1:c1");
  });

  it("contato bloqueado nunca é inscrito", () => {
    const blocked = contact({ id: "c2", isBlocked: true, blockedReason: "stop_keyword" });
    const result = createEnrollment({ campaignId: "camp-1", cadenceId: "cad-1", contact: blocked, existingEnrollments: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/bloqueado/);
  });

  it("segunda inscrição do mesmo contato na mesma campanha é rejeitada (idempotência)", () => {
    const first = createEnrollment({ campaignId: "camp-1", cadenceId: "cad-1", contact: c1, existingEnrollments: [] });
    if (!first.ok) throw new Error("setup falhou");
    const second = createEnrollment({ campaignId: "camp-1", cadenceId: "cad-1", contact: c1, existingEnrollments: [first.enrollment] });
    expect(second.ok).toBe(false);
  });

  it("mesmo contato em campanhas diferentes é permitido", () => {
    const first = createEnrollment({ campaignId: "camp-1", cadenceId: "cad-1", contact: c1, existingEnrollments: [] });
    if (!first.ok) throw new Error("setup falhou");
    const second = createEnrollment({ campaignId: "camp-2", cadenceId: "cad-1", contact: c1, existingEnrollments: [first.enrollment] });
    expect(second.ok).toBe(true);
  });
});

describe("activateEnrollment / advanceEnrollment", () => {
  const c = cadence([step({ id: "s1", order: 0, onSuccess: ["s2"] }), step({ id: "s2", order: 1, delaySeconds: 60 })]);

  function pendingEnrollment(): OutreachEnrollment {
    const result = createEnrollment({ campaignId: "camp-1", cadenceId: "cad-1", contact: contact({ id: "c1" }), existingEnrollments: [] });
    if (!result.ok) throw new Error("setup falhou");
    return result.enrollment;
  }

  it("ativa na primeira etapa da cadência", () => {
    const activated = activateEnrollment(pendingEnrollment(), c, new Date("2026-01-01T00:00:00.000Z"));
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.enrollment.status).toBe("active");
    expect(activated.enrollment.currentStepId).toBe("s1");
  });

  it("avança pra próxima etapa e calcula nextStepAt com delay", () => {
    const activated = activateEnrollment(pendingEnrollment(), c, new Date("2026-01-01T00:00:00.000Z"));
    if (!activated.ok) throw new Error("setup falhou");
    const advanced = advanceEnrollment(activated.enrollment, c, new Date("2026-01-01T00:00:00.000Z"));
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) return;
    expect(advanced.enrollment.currentStepId).toBe("s2");
    expect(advanced.enrollment.nextStepAt).toBe("2026-01-01T00:01:00.000Z");
  });

  it("avançar além da última etapa completa o enrollment", () => {
    const activated = activateEnrollment(pendingEnrollment(), c, new Date("2026-01-01T00:00:00.000Z"));
    if (!activated.ok) throw new Error("setup falhou");
    const step2 = advanceEnrollment(activated.enrollment, c, new Date("2026-01-01T00:00:00.000Z"));
    if (!step2.ok) throw new Error("setup falhou");
    const done = advanceEnrollment(step2.enrollment, c, new Date("2026-01-01T00:00:00.000Z"));
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.enrollment.status).toBe("completed");
  });

  it("não pode avançar um enrollment pending (precisa ativar antes)", () => {
    const result = advanceEnrollment(pendingEnrollment(), c);
    expect(result.ok).toBe(false);
  });
});

describe("markEnrollmentResponded / qualifyEnrollment / transferEnrollmentToHuman / failEnrollment / optOutEnrollment", () => {
  function activeEnrollment(): OutreachEnrollment {
    const created = createEnrollment({ campaignId: "camp-1", cadenceId: "cad-1", contact: contact({ id: "c1" }), existingEnrollments: [] });
    if (!created.ok) throw new Error("setup falhou");
    const activated = activateEnrollment(created.enrollment, cadence([step({ id: "s1", order: 0 })]));
    if (!activated.ok) throw new Error("setup falhou");
    return activated.enrollment;
  }

  it("markEnrollmentResponded registra a classificação", () => {
    const result = markEnrollmentResponded(activeEnrollment(), "interested");
    expect(result.ok && result.enrollment.status === "responded" && result.enrollment.responseClassification === "interested").toBe(true);
  });

  it("qualifyEnrollment exige status responded antes", () => {
    const responded = markEnrollmentResponded(activeEnrollment(), "interested");
    if (!responded.ok) throw new Error("setup falhou");
    const qualified = qualifyEnrollment(responded.enrollment);
    expect(qualified.ok && qualified.enrollment.status === "qualified").toBe(true);

    const directQualify = qualifyEnrollment(activeEnrollment());
    expect(directQualify.ok).toBe(false);
  });

  it("transferEnrollmentToHuman atribui ownerId", () => {
    const responded = markEnrollmentResponded(activeEnrollment(), "objection");
    if (!responded.ok) throw new Error("setup falhou");
    const transferred = transferEnrollmentToHuman(responded.enrollment, "owner-1");
    expect(transferred.ok && transferred.enrollment.ownerId === "owner-1").toBe(true);
  });

  it("failEnrollment registra o motivo em lastError", () => {
    const result = failEnrollment(activeEnrollment(), "canal indisponível");
    expect(result.ok && result.enrollment.lastError === "canal indisponível").toBe(true);
  });

  it("optOutEnrollment é sempre possível a partir de active", () => {
    const result = optOutEnrollment(activeEnrollment());
    expect(result.ok && result.enrollment.status === "opted_out").toBe(true);
  });
});

describe("cancelCadenceEnrollment / completeCadenceEnrollment (reusados por enrollments.ts)", () => {
  it("cancelCadenceEnrollment funciona a partir de pending", () => {
    const created = createEnrollment({ campaignId: "camp-1", cadenceId: "cad-1", contact: contact({ id: "c1" }), existingEnrollments: [] });
    if (!created.ok) throw new Error("setup falhou");
    const cancelled = cancelCadenceEnrollment(created.enrollment);
    expect(cancelled.ok && cancelled.enrollment.status === "cancelled").toBe(true);
  });

  it("completeCadenceEnrollment é terminal — não pode completar de novo", () => {
    const created = createEnrollment({ campaignId: "camp-1", cadenceId: "cad-1", contact: contact({ id: "c1" }), existingEnrollments: [] });
    if (!created.ok) throw new Error("setup falhou");
    const activated = activateEnrollment(created.enrollment, cadence([step({ id: "s1", order: 0 })]));
    if (!activated.ok) throw new Error("setup falhou");
    const completed = completeCadenceEnrollment(activated.enrollment);
    if (!completed.ok) throw new Error("setup falhou");
    const again = completeCadenceEnrollment(completed.enrollment);
    expect(again.ok).toBe(false);
  });
});
