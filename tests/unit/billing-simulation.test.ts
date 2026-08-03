import { describe, expect, it } from "vitest";

import { createDemoInstallations } from "@/lib/control-plane/repository";
import { BILLING_SCENARIOS, simulateBillingScenario } from "@/lib/billing/simulation";

const NOW = "2026-01-01T00:00:00.000Z";

function installation() {
  return createDemoInstallations()[0]!;
}

describe("simulateBillingScenario — todos os cenários são determinísticos e nunca lançam", () => {
  for (const scenario of BILLING_SCENARIOS) {
    it(`cenário "${scenario}" roda sem lançar e devolve summary`, () => {
      const result = simulateBillingScenario(installation(), scenario, NOW);
      expect(result.scenario).toBe(scenario);
      expect(result.summary).toBeDefined();
    });
  }

  it("mesmo scenario + mesmo installation + mesmo now produz o mesmo resultado de summary (determinístico)", () => {
    const inst = installation();
    const r1 = simulateBillingScenario(inst, "lite-active", NOW);
    const r2 = simulateBillingScenario(inst, "lite-active", NOW);
    expect(r1.summary.planId).toBe(r2.summary.planId);
    expect(r1.summary.status).toBe(r2.summary.status);
  });
});

describe("cenários específicos — asserções de conteúdo", () => {
  it("'trial' produz assinatura status 'trial' e evento trial_started", () => {
    const result = simulateBillingScenario(installation(), "trial", NOW);
    expect(result.subscription.status).toBe("trial");
    expect(result.events.some((e) => e.type === "trial_started")).toBe(true);
  });

  it("'invoice-paid' produz invoice status 'paid'", () => {
    const result = simulateBillingScenario(installation(), "invoice-paid", NOW);
    expect(result.invoice?.status).toBe("paid");
  });

  it("'invoice-overdue' produz invoice status 'overdue'", () => {
    const result = simulateBillingScenario(installation(), "invoice-overdue", NOW);
    expect(result.invoice?.status).toBe("overdue");
  });

  it("'grace-period' produz assinatura status 'grace_period'", () => {
    const result = simulateBillingScenario(installation(), "grace-period", NOW);
    expect(result.subscription.status).toBe("grace_period");
  });

  it("'suspension-recommended' produz assinatura status 'suspended' e financialRecommendation 'suspend_recommended'", () => {
    const result = simulateBillingScenario(installation(), "suspension-recommended", NOW);
    expect(result.subscription.status).toBe("suspended");
    expect(result.summary.financialRecommendation).toBe("suspend_recommended");
  });

  it("'upgrade-lite-to-pro' aplica upgrade imediatamente", () => {
    const result = simulateBillingScenario(installation(), "upgrade-lite-to-pro", NOW);
    expect(result.subscription.planId).toBe("pro");
    expect(result.subscription.pendingPlanChange).toBeUndefined();
  });

  it("'downgrade-dedicated-to-pro' agenda o downgrade (plano atual continua dedicated)", () => {
    const result = simulateBillingScenario(installation(), "downgrade-dedicated-to-pro", NOW);
    expect(result.subscription.planId).toBe("dedicated");
    expect(result.subscription.pendingPlanChange?.planId).toBe("pro");
  });

  it("'extra-module' adiciona item type 'module' à assinatura", () => {
    const result = simulateBillingScenario(installation(), "extra-module", NOW);
    expect(result.subscription.items.some((i) => i.type === "module")).toBe(true);
  });

  it("'usage-exceeded' produz usage snapshot com métrica acima do limite Lite", () => {
    const result = simulateBillingScenario(installation(), "usage-exceeded", NOW);
    expect(result.usage).toBeDefined();
    expect(result.summary.usageBlockers.length).toBeGreaterThan(0);
  });

  it("'cancel-at-period-end' marca cancelAtPeriodEnd sem mudar status ainda", () => {
    const result = simulateBillingScenario(installation(), "cancel-at-period-end", NOW);
    expect(result.subscription.cancelAtPeriodEnd).toBe(true);
    expect(result.subscription.status).toBe("active");
  });

  it("'cancel-immediate' cancela na hora", () => {
    const result = simulateBillingScenario(installation(), "cancel-immediate", NOW);
    expect(result.subscription.status).toBe("cancelled");
  });

  it("'discount-percentage'/'discount-fixed' aplicam desconto sem gerar total negativo", () => {
    const pct = simulateBillingScenario(installation(), "discount-percentage", NOW);
    const fixed = simulateBillingScenario(installation(), "discount-fixed", NOW);
    expect(pct.invoice!.total.amountCents).toBeGreaterThanOrEqual(0);
    expect(fixed.invoice!.total.amountCents).toBeGreaterThanOrEqual(0);
  });

  it("'credit' produz um BillingCredit com valor positivo", () => {
    const result = simulateBillingScenario(installation(), "credit", NOW);
    expect(result.credit?.amount.amountCents).toBeGreaterThan(0);
  });
});
