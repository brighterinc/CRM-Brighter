import { describe, expect, it } from "vitest";

import { generateProvisioningRollbackPreview, type ProvisioningAdapterStepOutcome } from "@/lib/provisioning-adapters";

function readyOutcome(stepId: string, provider: "supabase" | "vps", operation: string, reversible: boolean): ProvisioningAdapterStepOutcome {
  return {
    stepId,
    mapping: {
      status: "resolved",
      request: { installationId: "i", tenantId: "t", stepId, provider, operation, mode: "dry_run", input: {}, idempotencyKey: "k", requestedAt: "now" },
      capability: { id: `${provider}.${operation}`, provider, operation, description: "", supportedPlans: ["dedicated"], supportsDryRun: true, supportsRollbackPreview: reversible, realExecutionAvailable: false },
    },
    result: {
      requestId: `req-${stepId}`,
      provider,
      operation,
      status: "ready",
      output: {},
      blockers: [],
      warnings: [],
      rollbackAvailable: reversible,
      rollbackPreview: reversible ? { provider, operation, reversible: true, steps: [`reverter ${stepId}`], warnings: [] } : undefined,
      completedAt: "now",
    },
  };
}

describe("generateProvisioningRollbackPreview", () => {
  it("só inclui etapas com resultado pronto, em ordem INVERSA", () => {
    const outcomes: ProvisioningAdapterStepOutcome[] = [
      readyOutcome("step-a", "supabase", "project.create", true),
      readyOutcome("step-b", "vps", "server.validate", false),
    ];
    const preview = generateProvisioningRollbackPreview(outcomes);
    expect(preview.map((p) => p.stepId)).toEqual(["step-b", "step-a"]);
  });

  it("etapa não-reversível vem com reversible:false e warning explicando", () => {
    const outcomes = [readyOutcome("prepare_vps", "vps", "server.validate", false)];
    const preview = generateProvisioningRollbackPreview(outcomes);
    expect(preview[0]?.reversible).toBe(false);
    expect(preview[0]?.warnings.length).toBeGreaterThan(0);
  });

  it("ignora outcomes sem result ou com result não-pronto", () => {
    const outcomes: ProvisioningAdapterStepOutcome[] = [
      { stepId: "unmapped-step", mapping: { status: "unmapped", stepId: "unmapped-step" } },
    ];
    expect(generateProvisioningRollbackPreview(outcomes)).toEqual([]);
  });
});
