import { describe, expect, it } from "vitest";

import { sanitizeActivationPlanForExport, sanitizeHistoryEntry, sanitizeMarketplaceLogPayload, sanitizeMarketplaceOffer } from "@/lib/marketplace/sanitization";
import type { MarketplaceOffer, ModuleActivationPlan, ModuleLicenseHistoryEntry } from "@/lib/marketplace/types";

describe("sanitização — reusa sanitizeDeep, nunca reimplementa regex de segredo", () => {
  it("sanitizeMarketplaceOffer remove chave sensível de metadata", () => {
    const offer: MarketplaceOffer = {
      id: "o1",
      name: "X",
      type: "module",
      moduleIds: ["core.crm"],
      deploymentPlans: ["lite"],
      recurring: false,
      status: "active",
      enabled: true,
      visibility: "public",
      metadata: { apiKey: "segredo-123", note: "ok" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const sanitized = sanitizeMarketplaceOffer(offer);
    expect(JSON.stringify(sanitized.metadata)).not.toContain("segredo-123");
    expect(sanitized.metadata.note).toBe("ok");
  });

  it("sanitizeHistoryEntry limpa metadata sem alterar entrada sem metadata", () => {
    const entry: ModuleLicenseHistoryEntry = {
      id: "h1",
      tenantId: "t1",
      installationId: "i1",
      moduleId: "core.crm",
      type: "license_created",
      occurredAt: "2026-01-01T00:00:00.000Z",
      message: "criada",
    };
    expect(sanitizeHistoryEntry(entry)).toEqual(entry);

    const withSecret = { ...entry, metadata: { token: "abc123" } };
    const sanitized = sanitizeHistoryEntry(withSecret);
    expect(JSON.stringify(sanitized.metadata)).not.toContain("abc123");
  });

  it("sanitizeActivationPlanForExport remove qualquer valor associado a chave sensível", () => {
    const plan: ModuleActivationPlan = {
      moduleId: "ai.agents",
      currentState: "disabled",
      desiredState: "activated",
      prerequisites: [],
      blockers: [],
      warnings: [],
      provisioningSteps: [],
      requiredEnvironmentVariables: ["ENABLED_MODULES"],
      requiredBillingState: null,
      requiresRestart: false,
      requiresDeploy: false,
      reversible: true,
      recommendation: "ok",
    };
    const sanitized = sanitizeActivationPlanForExport(plan);
    expect(sanitized.moduleId).toBe("ai.agents");
  });

  it("sanitizeMarketplaceLogPayload remove serviceRoleKey/webhookSecret", () => {
    const sanitized = sanitizeMarketplaceLogPayload({ serviceRoleKey: "xyz", webhookSecret: "abc", moduleId: "ai.agents" });
    expect(JSON.stringify(sanitized)).not.toContain("xyz");
    expect(JSON.stringify(sanitized)).not.toContain("abc");
    expect(sanitized.moduleId).toBe("ai.agents");
  });
});
