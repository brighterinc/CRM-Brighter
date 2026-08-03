import { describe, expect, it } from "vitest";

import { getBillingPlanDefinition } from "@/lib/billing/catalog";
import { resolveBillingEntitlements } from "@/lib/billing/entitlements";
import { createSubscription, activateSubscription, suspendSubscription } from "@/lib/billing/subscriptions";

const NOW = "2026-01-01T00:00:00.000Z";

function subscriptionFor(planId: string) {
  return activateSubscription(
    createSubscription({ id: "sub-1", tenantId: "t1", installationId: "i1", planId, cycle: "monthly", startedAt: NOW }, NOW),
    NOW,
  );
}

describe("resolveBillingEntitlements", () => {
  it("módulo incluído no plano e tecnicamente habilitado é autorizado", () => {
    const plan = getBillingPlanDefinition("pro")!;
    const subscription = subscriptionFor("pro");
    const result = resolveBillingEntitlements({
      installation: { deploymentPlan: "pro", modules: plan.includedModules },
      subscription,
      billingPlan: plan,
    });
    expect(result.includedModules).toContain("core.crm");
    expect(result.authorizedModules).toContain("core.crm");
  });

  it("módulo extra (optionalModules) só é autorizado se contratado como item da assinatura", () => {
    const plan = getBillingPlanDefinition("lite")!;
    const extraId = plan.optionalModules[0]!;
    const withoutExtra = resolveBillingEntitlements({
      installation: { deploymentPlan: "lite", modules: [...plan.includedModules, extraId] },
      subscription: subscriptionFor("lite"),
      billingPlan: plan,
    });
    expect(withoutExtra.unauthorizedModules).toContain(extraId);

    const withExtraSub = { ...subscriptionFor("lite"), items: [{ id: "item-1", type: "module" as const, referenceId: extraId, description: "extra", quantity: 1, unitPrice: { amountCents: 990, currency: "BRL" as const }, recurring: true }] };
    const withExtra = resolveBillingEntitlements({
      installation: { deploymentPlan: "lite", modules: [...plan.includedModules, extraId] },
      subscription: withExtraSub,
      billingPlan: plan,
    });
    expect(withExtra.authorizedModules).toContain(extraId);
    expect(withExtra.extraModules).toContain(extraId);
  });

  it("módulo 'planned' nunca é autorizado, mesmo se tecnicamente 'habilitado'", () => {
    const plan = getBillingPlanDefinition("dedicated")!;
    const result = resolveBillingEntitlements({
      installation: { deploymentPlan: "dedicated", modules: [...plan.includedModules, "automation.campaigns"] },
      subscription: subscriptionFor("dedicated"),
      billingPlan: plan,
    });
    const entitlement = result.entitlements.find((e) => e.moduleId === "automation.campaigns")!;
    expect(entitlement.authorized).toBe(false);
    expect(entitlement.source).toBe("planned_status");
  });

  it("módulo fora do allowedPlans do deploymentPlan nunca é autorizado (ex.: channel.whatsapp em Lite)", () => {
    const plan = getBillingPlanDefinition("lite")!;
    const result = resolveBillingEntitlements({
      installation: { deploymentPlan: "lite", modules: [...plan.includedModules, "channel.whatsapp"] },
      subscription: subscriptionFor("lite"),
      billingPlan: plan,
    });
    const entitlement = result.entitlements.find((e) => e.moduleId === "channel.whatsapp")!;
    expect(entitlement.authorized).toBe(false);
    expect(entitlement.source).toBe("plan_not_allowed");
  });

  it("DISABLED_MODULES tem precedência: módulo incluído no plano mas não tecnicamente habilitado fica 'blocked_by_module_engine'", () => {
    const plan = getBillingPlanDefinition("pro")!;
    const modulesWithoutCrm = plan.includedModules.filter((id) => id !== "core.crm");
    const result = resolveBillingEntitlements({
      installation: { deploymentPlan: "pro", modules: modulesWithoutCrm },
      subscription: subscriptionFor("pro"),
      billingPlan: plan,
    });
    expect(result.blockedByModuleEngine).toContain("core.crm");
    expect(result.authorizedModules).not.toContain("core.crm");
  });

  it("assinatura suspensa: módulo core permanece autorizado em modo restrito (nunca remove dado)", () => {
    const plan = getBillingPlanDefinition("pro")!;
    const suspended = suspendSubscription(subscriptionFor("pro"), NOW);
    const result = resolveBillingEntitlements({
      installation: { deploymentPlan: "pro", modules: plan.includedModules },
      subscription: suspended,
      billingPlan: plan,
    });
    const core = result.entitlements.find((e) => e.moduleId === "core.crm")!;
    expect(core.authorized).toBe(true);
    expect(core.restricted).toBe(true);
    const nonCore = result.entitlements.find((e) => e.moduleId === "channel.email")!;
    expect(nonCore.authorized).toBe(false);
    expect(nonCore.source).toBe("blocked_by_subscription_status");
  });
});
