import { describe, expect, it } from "vitest";

import { BILLING_PLAN_CATALOG, getBillingPlanDefinition, isDowngrade, isUpgrade } from "@/lib/billing/catalog";
import { validateBillingPlanDefinition } from "@/lib/billing/validation";

describe("BILLING_PLAN_CATALOG — sanidade", () => {
  it("contém exatamente Lite, Pro e Dedicated", () => {
    expect(BILLING_PLAN_CATALOG.map((p) => p.id).sort()).toEqual(["dedicated", "lite", "pro"]);
  });

  it("cada plano referencia o DeploymentPlan de mesmo id — nunca redefine infraestrutura", () => {
    for (const plan of BILLING_PLAN_CATALOG) {
      expect(plan.deploymentPlan).toBe(plan.id);
    }
  });

  it("basePrice é placeholder de demonstração (amountCents 0) — nunca preço comercial real", () => {
    for (const plan of BILLING_PLAN_CATALOG) {
      expect(plan.basePrice.amountCents).toBe(0);
      expect(plan.basePrice.currency).toBe("BRL");
    }
  });

  it("nenhum plano inclui módulo 'planned' (automation.campaigns/integration.lumina/integration.sphere)", () => {
    const plannedIds = ["automation.campaigns", "integration.lumina", "integration.sphere"];
    for (const plan of BILLING_PLAN_CATALOG) {
      for (const id of plannedIds) {
        expect(plan.includedModules).not.toContain(id);
        expect(plan.optionalModules).not.toContain(id);
      }
    }
  });

  it("nenhum plano inclui módulo fora do allowedPlans do seu deploymentPlan (validateBillingPlanDefinition zero erros)", () => {
    for (const plan of BILLING_PLAN_CATALOG) {
      expect(validateBillingPlanDefinition(plan)).toEqual([]);
    }
  });

  it("channel.whatsapp só aparece no catálogo Dedicated", () => {
    const lite = getBillingPlanDefinition("lite")!;
    const pro = getBillingPlanDefinition("pro")!;
    const dedicated = getBillingPlanDefinition("dedicated")!;
    expect(lite.includedModules).not.toContain("channel.whatsapp");
    expect(pro.includedModules).not.toContain("channel.whatsapp");
    expect(dedicated.includedModules).toContain("channel.whatsapp");
  });

  it("Dedicated não tem limites definidos (ilimitado nesta Foundation)", () => {
    const dedicated = getBillingPlanDefinition("dedicated")!;
    expect(Object.keys(dedicated.limits)).toHaveLength(0);
  });

  it("getBillingPlanDefinition devolve undefined pra id desconhecido", () => {
    expect(getBillingPlanDefinition("inexistente")).toBeUndefined();
  });
});

describe("isUpgrade / isDowngrade", () => {
  it("lite → pro e pro → dedicated são upgrade", () => {
    expect(isUpgrade("lite", "pro")).toBe(true);
    expect(isUpgrade("pro", "dedicated")).toBe(true);
    expect(isUpgrade("lite", "dedicated")).toBe(true);
  });

  it("dedicated → pro e pro → lite são downgrade", () => {
    expect(isDowngrade("dedicated", "pro")).toBe(true);
    expect(isDowngrade("pro", "lite")).toBe(true);
  });

  it("dedicated não tem upgrade (é o topo)", () => {
    expect(getBillingPlanDefinition("dedicated")!.upgradeTo).toEqual([]);
  });

  it("lite não tem downgrade (é a base)", () => {
    expect(getBillingPlanDefinition("lite")!.downgradeTo).toEqual([]);
  });

  it("combinação fora do catálogo não é upgrade nem downgrade", () => {
    expect(isUpgrade("pro", "lite")).toBe(false);
    expect(isDowngrade("lite", "pro")).toBe(false);
  });
});
