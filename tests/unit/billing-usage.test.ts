import { describe, expect, it } from "vitest";

import {
  calculateUsagePercentage,
  deriveUsageBlockers,
  deriveUsageWarnings,
  evaluateUsageAgainstLimits,
  suggestPlanUpgrade,
} from "@/lib/billing/usage";
import type { BillingLimits, BillingUsageSnapshot } from "@/lib/billing/types";

const usage: BillingUsageSnapshot = {
  tenantId: "t1",
  installationId: "i1",
  periodStart: "2026-01-01T00:00:00.000Z",
  periodEnd: "2026-02-01T00:00:00.000Z",
  metrics: { messagesPerMonth: 800, contacts: 2000, users: 3 },
  observedAt: "2026-01-15T00:00:00.000Z",
};

const limits: BillingLimits = { messagesPerMonth: 1000, contacts: 2000, users: 5 };

describe("calculateUsagePercentage", () => {
  it("limite ausente devolve null (ilimitado)", () => {
    expect(calculateUsagePercentage(500, undefined)).toBeNull();
  });

  it("calcula percentual normal", () => {
    expect(calculateUsagePercentage(80, 100)).toBe(80);
  });
});

describe("evaluateUsageAgainstLimits", () => {
  it("uso em 80% do limite → status 'warning'", () => {
    const evaluations = evaluateUsageAgainstLimits(usage, limits);
    const messages = evaluations.find((e) => e.metric === "messagesPerMonth")!;
    expect(messages.percentage).toBe(80);
    expect(messages.status).toBe("warning");
  });

  it("uso em 100% do limite → status 'exceeded'", () => {
    const contacts = evaluateUsageAgainstLimits(usage, limits).find((e) => e.metric === "contacts")!;
    expect(contacts.percentage).toBe(100);
    expect(contacts.status).toBe("exceeded");
  });

  it("uso abaixo do limite → status 'ok'", () => {
    const users = evaluateUsageAgainstLimits(usage, limits).find((e) => e.metric === "users")!;
    expect(users.status).toBe("ok");
  });

  it("consumo acima do limite (>100%) também é 'exceeded'", () => {
    const over: BillingUsageSnapshot = { ...usage, metrics: { messagesPerMonth: 1500 } };
    const evaluations = evaluateUsageAgainstLimits(over, { messagesPerMonth: 1000 });
    expect(evaluations[0]?.status).toBe("exceeded");
    expect(evaluations[0]?.percentage).toBe(150);
  });

  it("métrica sem limite declarado no plano vira 'unlimited', nunca contabilizada como exceeded", () => {
    const evaluations = evaluateUsageAgainstLimits(usage, {});
    expect(evaluations).toEqual([]);
  });

  it("métrica ausente em usage.metrics conta como 0 (não lança erro)", () => {
    const evaluations = evaluateUsageAgainstLimits({ ...usage, metrics: {} }, { storageMb: 1024 });
    expect(evaluations[0]?.used).toBe(0);
    expect(evaluations[0]?.status).toBe("ok");
  });
});

describe("deriveUsageWarnings / deriveUsageBlockers — nunca bloqueiam de verdade, só alertam", () => {
  it("warnings só pra métricas em 'warning'", () => {
    const evaluations = evaluateUsageAgainstLimits(usage, limits);
    const warnings = deriveUsageWarnings(evaluations);
    expect(warnings.some((w) => w.includes("mensagens"))).toBe(true);
  });

  it("blockers só pra métricas 'exceeded'", () => {
    const evaluations = evaluateUsageAgainstLimits(usage, limits);
    const blockers = deriveUsageBlockers(evaluations);
    expect(blockers.some((b) => b.includes("contatos"))).toBe(true);
  });
});

describe("suggestPlanUpgrade", () => {
  it("sem métrica excedida, não sugere nada", () => {
    const evaluations = evaluateUsageAgainstLimits(usage, limits).filter((e) => e.metric !== "contacts");
    expect(suggestPlanUpgrade("lite", evaluations)).toBeNull();
  });

  it("com métrica excedida, sugere o próximo plano de upgrade do catálogo", () => {
    const evaluations = evaluateUsageAgainstLimits(usage, limits);
    expect(suggestPlanUpgrade("lite", evaluations)).toBe("pro");
  });

  it("plano sem upgrade disponível (dedicated) nunca sugere nada mesmo excedido", () => {
    const evaluations = evaluateUsageAgainstLimits(usage, limits);
    expect(suggestPlanUpgrade("dedicated", evaluations)).toBeNull();
  });
});
