import { describe, expect, it } from "vitest";

import {
  attachMarketplaceActivationToProvisioningPlan,
  attachMarketplaceSummaryToInstallationSummary,
  billingAuthorizationForModule,
  evaluateMonitoringHealthForModule,
  resolveMarketplaceBillingEntitlements,
} from "@/lib/marketplace/integrations";
import { resolveMarketplaceEntitlements } from "@/lib/marketplace/entitlements";
import { buildMarketplaceCatalog } from "@/lib/marketplace/catalog";
import type { MonitoringSnapshot } from "@/lib/monitoring/types";
import type { ModuleActivationPlan } from "@/lib/marketplace/types";

const BILLING_PLAN = {
  id: "demo-plan",
  name: "Demo",
  description: "x",
  deploymentPlan: "dedicated" as const,
  allowedCycles: ["monthly" as const],
  basePrice: { amountCents: 0, currency: "BRL" as const },
  includedModules: ["core.crm", "core.contacts"],
  optionalModules: ["ai.agents"],
  limits: {},
  gracePeriodDays: 7,
  upgradeTo: [],
  downgradeTo: [],
  enabled: true,
};

function buildSubscription(status: "active" | "suspended", purchased: string[]) {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "sub-1",
    tenantId: "t1",
    installationId: "i1",
    planId: "demo-plan",
    cycle: "monthly" as const,
    status,
    startedAt: now,
    currentPeriodStart: now,
    currentPeriodEnd: now,
    cancelAtPeriodEnd: false,
    items: purchased.map((moduleId, i) => ({ id: `item-${i}`, type: "module" as const, referenceId: moduleId, description: moduleId, quantity: 1, unitPrice: { amountCents: 0, currency: "BRL" as const }, recurring: true })),
    discounts: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe("Billing integration", () => {
  it("billingAuthorizationForModule reflete o entitlement resolvido pelo Billing Engine", () => {
    const result = resolveMarketplaceBillingEntitlements({
      installation: { deploymentPlan: "dedicated", modules: ["core.crm", "core.contacts", "ai.agents"] },
      subscription: buildSubscription("active", ["ai.agents"]),
      billingPlan: BILLING_PLAN,
    });
    const auth = billingAuthorizationForModule("ai.agents", result);
    expect(auth.authorized).toBe(true);

    const deniedAuth = billingAuthorizationForModule("ai.agents", resolveMarketplaceBillingEntitlements({
      installation: { deploymentPlan: "dedicated", modules: ["core.crm", "core.contacts", "ai.agents"] },
      subscription: buildSubscription("active", []),
      billingPlan: BILLING_PLAN,
    }));
    expect(deniedAuth.authorized).toBe(false);
    expect(deniedAuth.blockers.length).toBeGreaterThan(0);
  });
});

describe("Monitoring integration — só operacional, nunca financeiro", () => {
  const unhealthySnapshot: MonitoringSnapshot = {
    id: "snap-1",
    installationId: "i1",
    tenantId: "t1",
    plan: "dedicated",
    status: "completed",
    overallHealth: "unhealthy",
    score: 10,
    checks: [{ checkId: "waha_available", status: "unhealthy", observedAt: "2026-01-01T00:00:00.000Z", message: "WAHA indisponível" }],
    incidents: [],
    blockers: [],
    warnings: [],
    missingCheckIds: [],
    lateCheckIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("check unhealthy relevante ao módulo gera blocker operacional", () => {
    const result = evaluateMonitoringHealthForModule(unhealthySnapshot, "channel.whatsapp");
    expect(result.healthy).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("módulo sem check relevante é sempre healthy, mesmo com snapshot ruim", () => {
    const result = evaluateMonitoringHealthForModule(unhealthySnapshot, "core.crm");
    expect(result.healthy).toBe(true);
  });

  it("sem snapshot é sempre healthy (nunca bloqueia por falta de dado)", () => {
    expect(evaluateMonitoringHealthForModule(undefined, "channel.whatsapp").healthy).toBe(true);
  });
});

describe("Provisioning attach — view model, nunca altera ProvisioningPlan real", () => {
  it("agrega blockers/warnings/steps de vários planos de ativação", () => {
    const plan: ModuleActivationPlan = {
      moduleId: "channel.whatsapp",
      currentState: "disabled",
      desiredState: "activated",
      prerequisites: [],
      blockers: [],
      warnings: [],
      provisioningSteps: ["etapa 1"],
      requiredEnvironmentVariables: ["ENABLED_MODULES"],
      requiredBillingState: null,
      requiresRestart: true,
      requiresDeploy: true,
      reversible: true,
      recommendation: "pronto",
    };
    const attachment = attachMarketplaceActivationToProvisioningPlan({ id: "plan-1" }, [plan]);
    expect(attachment.provisioningPlanId).toBe("plan-1");
    expect(attachment.modulesToActivate).toEqual(["channel.whatsapp"]);
    expect(attachment.restartRecommended).toBe(true);
    expect(attachment.deployRecommended).toBe(true);
  });
});

describe("Control Plane attach — view model combinado, nunca escreve na Installation", () => {
  it("resume módulos licenciados/ativos/suspensos e recomenda ação", () => {
    const catalog = buildMarketplaceCatalog();
    const entitlements = resolveMarketplaceEntitlements({ installation: { enabledModules: ["core.crm", "core.contacts"] }, catalog, licenses: [], trials: [] });
    const attachment = attachMarketplaceSummaryToInstallationSummary({ id: "inst-1" }, entitlements, [], []);
    expect(attachment.installationId).toBe("inst-1");
    expect(typeof attachment.recommendedAction).toBe("string");
  });
});
