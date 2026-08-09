import { describe, expect, it } from "vitest";

import { sanitizeAdapterInput, sanitizeAdapterOutput, sanitizeAdapterResultForLog, sanitizeAdapterSummaryPayload } from "@/lib/provisioning-adapters";

const DIRTY_PAYLOAD = {
  projectRef: "abc123",
  serviceRoleKey: "should-be-removed",
  password: "should-be-removed",
  apiKey: "should-be-removed",
  webhookSecret: "should-be-removed",
  nested: { connectionString: "should-be-removed", ok: "kept" },
};

describe("sanitização", () => {
  it("sanitizeAdapterInput remove todas as chaves sensíveis, recursivamente", () => {
    const sanitized = sanitizeAdapterInput(DIRTY_PAYLOAD);
    expect(sanitized).not.toHaveProperty("serviceRoleKey");
    expect(sanitized).not.toHaveProperty("password");
    expect(sanitized).not.toHaveProperty("apiKey");
    expect(sanitized).not.toHaveProperty("webhookSecret");
    expect((sanitized as never as typeof DIRTY_PAYLOAD).nested).not.toHaveProperty("connectionString");
    expect((sanitized as never as typeof DIRTY_PAYLOAD).nested.ok).toBe("kept");
    expect(sanitized.projectRef).toBe("abc123");
  });

  it("sanitizeAdapterOutput tem a mesma garantia", () => {
    const sanitized = sanitizeAdapterOutput(DIRTY_PAYLOAD);
    expect(JSON.stringify(sanitized)).not.toMatch(/should-be-removed/);
  });

  it("sanitizeAdapterResultForLog sanitiza output e rollbackPreview", () => {
    const result = sanitizeAdapterResultForLog({
      requestId: "r1",
      provider: "supabase",
      operation: "project.create",
      status: "ready",
      output: { serviceRoleKey: "x", ok: 1 },
      blockers: [],
      warnings: [],
      rollbackAvailable: true,
      rollbackPreview: { provider: "supabase", operation: "project.create", reversible: true, steps: ["ok"], warnings: [] },
      completedAt: "now",
    });
    expect(result.output).not.toHaveProperty("serviceRoleKey");
  });

  it("sanitizeAdapterSummaryPayload nunca vaza segredo", () => {
    const sanitized = sanitizeAdapterSummaryPayload({ dnsToken: "x", vercelToken: "y", ok: "z" });
    expect(sanitized).not.toHaveProperty("dnsToken");
    expect(sanitized).not.toHaveProperty("vercelToken");
    expect(sanitized.ok).toBe("z");
  });
});
