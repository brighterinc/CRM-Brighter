import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createDemoInstallations } from "@/lib/control-plane/repository";
import {
  attachBillingSummaryToInstallationSummary,
  generateBillingControlPlaneOverview,
  generateBillingSummary,
  renderBillingSummaryMarkdown,
} from "@/lib/billing/summary";
import { activateSubscription, createSubscription } from "@/lib/billing/subscriptions";

const NOW = "2026-01-01T00:00:00.000Z";

function installation() {
  return createDemoInstallations()[0]!;
}

function subscriptionFor(inst = installation()) {
  return activateSubscription(
    createSubscription(
      { id: "sub-1", tenantId: inst.tenant.id, installationId: inst.id, planId: inst.deploymentPlan, cycle: "monthly", startedAt: NOW },
      NOW,
    ),
    NOW,
  );
}

describe("generateBillingSummary", () => {
  it("resume plano, ciclo, status e módulos incluídos", () => {
    const inst = installation();
    const summary = generateBillingSummary({ installation: inst, subscription: subscriptionFor(inst) }, NOW);
    expect(summary.planId).toBe(inst.deploymentPlan);
    expect(summary.status).toBe("active");
    expect(summary.financialRecommendation).toBe("keep_active");
  });

  it("lança erro claro se o planId da assinatura não existe no catálogo", () => {
    const inst = installation();
    const badSub = { ...subscriptionFor(inst), planId: "inexistente" };
    expect(() => generateBillingSummary({ installation: inst, subscription: badSub }, NOW)).toThrow(/billing_plan_not_found/);
  });
});

describe("renderBillingSummaryMarkdown", () => {
  it("contém as seções esperadas", () => {
    const inst = installation();
    const summary = generateBillingSummary({ installation: inst, subscription: subscriptionFor(inst) }, NOW);
    const markdown = renderBillingSummaryMarkdown(summary);
    expect(markdown).toContain("## Módulos incluídos");
    expect(markdown).toContain("## Blockers");
    expect(markdown).toContain("## Warnings");
  });
});

describe("integração com a Control Plane — nunca altera Installation/ControlPlaneSummary", () => {
  it("attachBillingSummaryToInstallationSummary: sem assinatura devolve hasSubscription: false", () => {
    const inst = installation();
    const overview = attachBillingSummaryToInstallationSummary(inst, null);
    expect(overview.hasSubscription).toBe(false);
    expect(overview.financialRecommendation).toBe("keep_active");
  });

  it("generateBillingControlPlaneOverview agrega várias instalações", () => {
    const installations = createDemoInstallations();
    const byId = new Map(installations.map((inst) => [inst.id, subscriptionFor(inst)]));
    const overview = generateBillingControlPlaneOverview(installations, byId, NOW);
    expect(overview.total).toBe(installations.length);
    expect(overview.active).toBe(installations.length);
    expect(overview.withoutSubscription).toBe(0);
  });
});

describe("separação Billing x Monitoring (spec §14) — doutrina estrutural", () => {
  it("lib/billing/summary.ts nunca importa lib/monitoring", () => {
    const source = readFileSync(join(process.cwd(), "lib/billing/summary.ts"), "utf-8");
    expect(source).not.toMatch(/^import.*@\/lib\/monitoring/m);
  });

  it("nenhum arquivo de lib/billing importa lib/monitoring (billing nunca decide saúde técnica)", () => {
    const files = ["types", "status", "catalog", "pricing", "validation", "subscriptions", "usage", "entitlements", "invoices", "events", "sanitization", "adapters", "repository", "summary", "simulation", "index"];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), `lib/billing/${file}.ts`), "utf-8");
      expect(source, `${file}.ts não deveria importar lib/monitoring`).not.toMatch(/@\/lib\/monitoring/);
    }
  });
});
