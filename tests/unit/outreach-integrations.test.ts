import { describe, expect, it } from "vitest";

import type { BillingPlanDefinition, BillingSubscription } from "@/lib/billing/types";
import type { MonitoringSnapshot } from "@/lib/monitoring/types";
import {
  attachOutreachSummaryToInstallationSummary,
  evaluateChannelHealthForOutreach,
  mapCadenceToAutomationView,
  mapEnrollmentToAutomationExecutionView,
  validateOutreachEntitlement,
} from "@/lib/outreach/integrations";
import { createDemoCadence } from "@/lib/outreach/repository";
import type { OutreachCampaign, OutreachEnrollment } from "@/lib/outreach/types";

const billingPlan: BillingPlanDefinition = {
  id: "plan-1",
  name: "Plano teste",
  description: "",
  deploymentPlan: "dedicated",
  allowedCycles: ["monthly"],
  basePrice: { amountCents: 0, currency: "BRL" },
  includedModules: ["automation.campaigns", "channel.whatsapp"],
  optionalModules: [],
  limits: { campaignsPerMonth: 5 },
  gracePeriodDays: 7,
  upgradeTo: [],
  downgradeTo: [],
  enabled: true,
};

function subscription(overrides: Partial<BillingSubscription> = {}): BillingSubscription {
  const now = new Date().toISOString();
  return {
    id: "sub-1",
    tenantId: "inst-1",
    installationId: "inst-1",
    planId: "plan-1",
    cycle: "monthly",
    status: "active",
    startedAt: now,
    currentPeriodStart: now,
    currentPeriodEnd: now,
    cancelAtPeriodEnd: false,
    items: [],
    discounts: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("validateOutreachEntitlement", () => {
  it("automation.campaigns é status:\"planned\" no MODULE_CATALOG real — NUNCA autorizado nesta Foundation, mesmo incluído no plano comercial e habilitado no Module Engine", () => {
    const result = validateOutreachEntitlement({
      installation: { deploymentPlan: "dedicated", modules: ["automation.campaigns", "channel.whatsapp"] },
      subscription: subscription(),
      billingPlan,
      channel: "whatsapp",
    });
    expect(result.campaignModuleAuthorized).toBe(false);
    expect(result.channelModuleAuthorized).toBe(true);
    expect(result.blockers.some((b) => b.includes("automation.campaigns"))).toBe(true);
  });

  it("canal whatsapp autorizado quando channel.whatsapp está no Module Engine + plano comercial", () => {
    const result = validateOutreachEntitlement({
      installation: { deploymentPlan: "dedicated", modules: ["channel.whatsapp"] },
      subscription: subscription(),
      billingPlan,
      channel: "whatsapp",
    });
    expect(result.channelModuleAuthorized).toBe(true);
  });

  it("módulo de canal fora do Module Engine gera blocker de canal", () => {
    const result = validateOutreachEntitlement({
      installation: { deploymentPlan: "dedicated", modules: [] },
      subscription: subscription(),
      billingPlan,
      channel: "whatsapp",
    });
    expect(result.channelModuleAuthorized).toBe(false);
    expect(result.blockers.some((b) => b.includes("channel.whatsapp"))).toBe(true);
  });

  it("limite de campanhas do mês atingido gera blocker", () => {
    const result = validateOutreachEntitlement({
      installation: { deploymentPlan: "dedicated", modules: ["automation.campaigns", "channel.whatsapp"] },
      subscription: subscription(),
      billingPlan,
      channel: "whatsapp",
      usage: { campaignsThisMonth: 5 },
    });
    expect(result.blockers.some((b) => b.includes("limite de campanhas"))).toBe(true);
  });

  it("assinatura suspensa bloqueia módulo não-core (channel.whatsapp não é core.*)", () => {
    const result = validateOutreachEntitlement({
      installation: { deploymentPlan: "dedicated", modules: ["automation.campaigns", "channel.whatsapp"] },
      subscription: subscription({ status: "suspended" }),
      billingPlan,
      channel: "whatsapp",
    });
    expect(result.channelModuleAuthorized).toBe(false);
  });
});

describe("evaluateChannelHealthForOutreach", () => {
  function snapshot(checkStatus: "healthy" | "unhealthy" | "degraded"): MonitoringSnapshot {
    return {
      id: "snap-1",
      installationId: "inst-1",
      tenantId: "tenant-1",
      plan: "dedicated",
      status: "completed",
      overallHealth: checkStatus,
      score: checkStatus === "healthy" ? 100 : 40,
      checks: [{ checkId: "waha_available", status: checkStatus, observedAt: new Date().toISOString(), message: "teste" }],
      incidents: [],
      blockers: [],
      warnings: [],
      missingCheckIds: [],
      lateCheckIds: [],
      createdAt: new Date().toISOString(),
    };
  }

  it("canal saudável: sem blockers", () => {
    const result = evaluateChannelHealthForOutreach(snapshot("healthy"), "whatsapp");
    expect(result.healthy).toBe(true);
  });

  it("canal indisponível: blocker", () => {
    const result = evaluateChannelHealthForOutreach(snapshot("unhealthy"), "whatsapp");
    expect(result.healthy).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("canal internal nunca depende de snapshot de monitoramento", () => {
    const result = evaluateChannelHealthForOutreach(undefined, "internal");
    expect(result.healthy).toBe(true);
  });
});

describe("mapCadenceToAutomationView / mapEnrollmentToAutomationExecutionView", () => {
  it("view model de cadência nunca é um WorkflowDefinition real — só representação", () => {
    const view = mapCadenceToAutomationView(createDemoCadence());
    expect(view.triggerLike).toBe("campaign_step_due");
    expect(view.note).toContain("nunca um WorkflowDefinition");
  });

  it("view model de enrollment mapeia status pro vocabulário de run", () => {
    const enrollment: OutreachEnrollment = {
      id: "e1",
      campaignId: "camp-1",
      cadenceId: "cad-1",
      contactId: "c1",
      status: "active",
      idempotencyKey: "camp-1:c1",
      attempts: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(mapEnrollmentToAutomationExecutionView(enrollment).statusLike).toBe("running");
  });
});

describe("attachOutreachSummaryToInstallationSummary", () => {
  it("agrega contagem por status, nunca escreve na Installation", () => {
    const campaigns: OutreachCampaign[] = [
      { id: "c1", installationId: "inst-1", name: "A", status: "active", channel: "whatsapp", segmentId: "s1", cadenceId: "cad-1", createdAt: "", updatedAt: "" },
      { id: "c2", installationId: "inst-1", name: "B", status: "blocked", channel: "whatsapp", segmentId: "s1", cadenceId: "cad-1", createdAt: "", updatedAt: "" },
    ];
    const enrollments: OutreachEnrollment[] = [
      { id: "e1", campaignId: "c1", cadenceId: "cad-1", contactId: "c1", status: "opted_out", idempotencyKey: "c1:c1", attempts: 0, createdAt: "", updatedAt: "" },
    ];
    const result = attachOutreachSummaryToInstallationSummary({ id: "inst-1" }, campaigns, enrollments);
    expect(result.activeCampaigns).toBe(1);
    expect(result.blockedCampaigns).toBe(1);
    expect(result.optedOutEnrollments).toBe(1);
    expect(result.recommendedActions.length).toBeGreaterThan(0);
  });
});
