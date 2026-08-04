import { describe, expect, it } from "vitest";

import { sanitizeWorkflowHistoryEntry, sanitizeWorkflowRun } from "@/lib/automation-engine/sanitization";
import { createWorkflowHistoryEntry } from "@/lib/automation-engine/history";
import type { WorkflowRun } from "@/lib/automation-engine/types";

describe("createWorkflowHistoryEntry", () => {
  it("sanitiza metadata na criação — nunca segredo chega no history", () => {
    const entry = createWorkflowHistoryEntry({
      runId: "run-1",
      workflowId: "wf-1",
      stepId: "step-1",
      level: "info",
      event: "step.success",
      message: "ok",
      metadata: { api_key: "sk-secret-123", safe_field: "ok" },
    });
    expect(entry.metadata.api_key).toBeUndefined();
    expect(entry.metadata.safe_field).toBe("ok");
  });
});

describe("sanitizeWorkflowHistoryEntry / sanitizeWorkflowRun", () => {
  it("sanitizeWorkflowHistoryEntry remove chave sensível recursivamente", () => {
    const entry = {
      timestamp: new Date().toISOString(),
      runId: "run-1",
      workflowId: "wf-1",
      level: "info" as const,
      event: "e",
      message: "m",
      metadata: { nested: { database_url: "postgres://user:pass@host/db" }, ok: 1 },
    };
    const sanitized = sanitizeWorkflowHistoryEntry(entry);
    expect((sanitized.metadata.nested as Record<string, unknown>).database_url).toBeUndefined();
    expect(sanitized.metadata.ok).toBe(1);
  });

  it("sanitizeWorkflowRun sanitiza todo o history de uma vez", () => {
    const run: WorkflowRun = {
      id: "run-1",
      workflowId: "wf-1",
      installationId: "installation-1",
      status: "completed",
      triggerFingerprint: "wf_abc123",
      steps: [],
      history: [
        {
          timestamp: new Date().toISOString(),
          runId: "run-1",
          workflowId: "wf-1",
          level: "info",
          event: "e",
          message: "m",
          metadata: { secret_token: "should-be-removed" },
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const sanitized = sanitizeWorkflowRun(run);
    expect(sanitized.history[0]?.metadata.secret_token).toBeUndefined();
  });
});
