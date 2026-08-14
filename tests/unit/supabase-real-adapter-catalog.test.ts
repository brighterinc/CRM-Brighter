import { describe, expect, it } from "vitest";

import {
  findSupabaseRealOperation,
  isSupabaseRealOperation,
  resolveCredentialRequirementForSupabaseRealOperation,
  SUPABASE_REAL_OPERATION_CATALOG,
  SUPABASE_REAL_OPERATIONS,
} from "@/lib/provisioning-adapters/providers/supabase-real-operations";
import { isRealProvisioningEnabled } from "@/lib/provisioning-adapters/providers/supabase-real-gate";
import { buildSupabaseRealIdempotencyKey } from "@/lib/provisioning-adapters/providers/supabase-real-idempotency";
import { buildSupabaseRealRollbackPreview } from "@/lib/provisioning-adapters/providers/supabase-real-rollback";
import { isRetryableSupabaseError, withSupabaseRetry } from "@/lib/provisioning-adapters/providers/supabase-real-retry";
import { SupabaseApiError, SupabaseRateLimitError, SupabaseTimeoutError, SupabaseAccessDeniedError, SupabaseCredentialInvalidError } from "@/lib/provisioning-adapters/providers/supabase-errors";
import { dryRunSupabaseRealOperation } from "@/lib/provisioning-adapters/providers/supabase-real";

describe("supabase-real operation catalog", () => {
  it("covers all 8 operations with a classification", () => {
    expect(SUPABASE_REAL_OPERATION_CATALOG).toHaveLength(SUPABASE_REAL_OPERATIONS.length);
    for (const operation of SUPABASE_REAL_OPERATIONS) {
      expect(findSupabaseRealOperation(operation)).toBeDefined();
    }
  });

  it("classifies only project.validate/read/status as real_supported", () => {
    const realSupported = SUPABASE_REAL_OPERATION_CATALOG.filter((e) => e.classification === "real_supported").map((e) => e.operation);
    expect(realSupported.sort()).toEqual(["project.read", "project.status", "project.validate"].sort());
  });

  it("keeps project.create as dry_run_only even though it has a rollback preview", () => {
    const entry = findSupabaseRealOperation("project.create");
    expect(entry?.classification).toBe("dry_run_only");
    expect(entry?.supportsRollbackPreview).toBe(true);
  });

  it("classifies the 4 configuration operations as planned", () => {
    const planned = SUPABASE_REAL_OPERATION_CATALOG.filter((e) => e.classification === "planned").map((e) => e.operation).sort();
    expect(planned).toEqual(["auth.configure", "database.prepare", "edge_functions.prepare", "storage.prepare"].sort());
  });

  it("never declares an unknown credential purpose/secret type", () => {
    for (const entry of SUPABASE_REAL_OPERATION_CATALOG) {
      expect(entry.requiredCredentialPurpose).toBeTruthy();
      expect(entry.requiredSecretType).toBeTruthy();
    }
  });

  it("isSupabaseRealOperation rejects unknown strings", () => {
    expect(isSupabaseRealOperation("project.validate")).toBe(true);
    expect(isSupabaseRealOperation("project.delete")).toBe(false);
  });

  it("resolveCredentialRequirementForSupabaseRealOperation only resolves for provider supabase", () => {
    expect(resolveCredentialRequirementForSupabaseRealOperation("supabase", "project.read")).toEqual({ purpose: "deploy", secretType: "api_key" });
    expect(resolveCredentialRequirementForSupabaseRealOperation("vercel", "project.read")).toBeNull();
    expect(resolveCredentialRequirementForSupabaseRealOperation("supabase", "unknown.op")).toBeNull();
  });
});

describe("supabase-real gate", () => {
  it("defaults to disabled when env var is absent", () => {
    expect(isRealProvisioningEnabled({})).toBe(false);
  });

  it("is enabled only when the value is exactly the string 'true'", () => {
    expect(isRealProvisioningEnabled({ REAL_PROVISIONING_ENABLED: "true" })).toBe(true);
    expect(isRealProvisioningEnabled({ REAL_PROVISIONING_ENABLED: "TRUE" })).toBe(false);
    expect(isRealProvisioningEnabled({ REAL_PROVISIONING_ENABLED: "1" })).toBe(false);
  });
});

describe("supabase-real idempotency", () => {
  it("is stable regardless of input key order", () => {
    const base = { tenantId: "t1", installationId: "i1", operation: "project.read" };
    const keyA = buildSupabaseRealIdempotencyKey({ ...base, input: { projectRef: "abc", region: "us" } });
    const keyB = buildSupabaseRealIdempotencyKey({ ...base, input: { region: "us", projectRef: "abc" } });
    expect(keyA).toBe(keyB);
  });

  it("changes when the operation or tenant changes", () => {
    const keyA = buildSupabaseRealIdempotencyKey({ tenantId: "t1", installationId: "i1", operation: "project.read", input: {} });
    const keyB = buildSupabaseRealIdempotencyKey({ tenantId: "t2", installationId: "i1", operation: "project.read", input: {} });
    expect(keyA).not.toBe(keyB);
  });

  it("never leaks a value under a sensitive key into the hash input (structurally — same key removed either side)", () => {
    const withSecret = buildSupabaseRealIdempotencyKey({ tenantId: "t1", installationId: "i1", operation: "project.read", input: { token: "shhh", projectRef: "abc" } });
    const withoutSecret = buildSupabaseRealIdempotencyKey({ tenantId: "t1", installationId: "i1", operation: "project.read", input: { projectRef: "abc" } });
    expect(withSecret).toBe(withoutSecret);
  });
});

describe("supabase-real retry policy", () => {
  it("flags timeout/429/retryable 5xx as retryable", () => {
    const ctx = { requestId: "r", correlationId: "c" };
    expect(isRetryableSupabaseError(new SupabaseTimeoutError(1000, ctx))).toBe(true);
    expect(isRetryableSupabaseError(new SupabaseRateLimitError(1, ctx))).toBe(true);
    expect(isRetryableSupabaseError(new SupabaseApiError(503, ctx))).toBe(true);
    expect(isRetryableSupabaseError(new SupabaseApiError(500, ctx))).toBe(false);
  });

  it("never retries logical/auth errors (401/403)", () => {
    const ctx = { requestId: "r", correlationId: "c" };
    expect(isRetryableSupabaseError(new SupabaseCredentialInvalidError(ctx))).toBe(false);
    expect(isRetryableSupabaseError(new SupabaseAccessDeniedError(ctx))).toBe(false);
  });

  it("retries transient failures up to maxAttempts then succeeds", async () => {
    let calls = 0;
    const ctx = { requestId: "r", correlationId: "c" };
    const outcome = await withSupabaseRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new SupabaseTimeoutError(1000, ctx);
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
      async () => {},
    );
    expect(outcome.result).toBe("ok");
    expect(outcome.attempts).toBe(3);
  });

  it("never retries a 401 — fails on first attempt", async () => {
    let calls = 0;
    const ctx = { requestId: "r", correlationId: "c" };
    await expect(
      withSupabaseRetry(
        async () => {
          calls += 1;
          throw new SupabaseCredentialInvalidError(ctx);
        },
        { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
        async () => {},
      ),
    ).rejects.toBeInstanceOf(SupabaseCredentialInvalidError);
    expect(calls).toBe(1);
  });

  it("never retries a 403 — fails on first attempt", async () => {
    let calls = 0;
    const ctx = { requestId: "r", correlationId: "c" };
    await expect(
      withSupabaseRetry(
        async () => {
          calls += 1;
          throw new SupabaseAccessDeniedError(ctx);
        },
        { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
        async () => {},
      ),
    ).rejects.toBeInstanceOf(SupabaseAccessDeniedError);
    expect(calls).toBe(1);
  });

  it("stops retrying after maxAttempts and rethrows the last error", async () => {
    let calls = 0;
    const ctx = { requestId: "r", correlationId: "c" };
    await expect(
      withSupabaseRetry(
        async () => {
          calls += 1;
          throw new SupabaseRateLimitError(1, ctx);
        },
        { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
        async () => {},
      ),
    ).rejects.toBeInstanceOf(SupabaseRateLimitError);
    expect(calls).toBe(3);
  });
});

describe("supabase-real rollback preview", () => {
  it("project.create requires human approval and flags data loss risk", () => {
    const preview = buildSupabaseRealRollbackPreview("project.create");
    expect(preview.reversible).toBe(true);
    expect(preview.requiresHumanApproval).toBe(true);
    expect(preview.dataLossRisk).toBe(true);
  });

  it("read-only operations are not reversible", () => {
    const preview = buildSupabaseRealRollbackPreview("project.read");
    expect(preview.reversible).toBe(false);
    expect(preview.steps).toEqual([]);
  });
});

describe("dryRunSupabaseRealOperation", () => {
  it("never touches network and works with the gate off", () => {
    const result = dryRunSupabaseRealOperation({
      installationId: "inst-1",
      tenantId: "tenant-1",
      operation: "project.read",
      input: { projectRef: "abc" },
      correlationId: "corr-1",
      requestedAt: new Date().toISOString(),
    });
    expect(result.mode).toBe("dry_run");
    expect(result.status).toBe("simulated");
    expect(result.output.endpoint).toBe("GET /v1/projects/{ref}");
  });

  it("blocks when a required input field is missing", () => {
    const result = dryRunSupabaseRealOperation({
      installationId: "inst-1",
      tenantId: "tenant-1",
      operation: "project.read",
      input: {},
      correlationId: "corr-1",
      requestedAt: new Date().toISOString(),
    });
    expect(result.status).toBe("blocked");
    expect(result.blockers.some((b) => b.includes("projectRef"))).toBe(true);
  });

  it("never leaks a secret-shaped field placed in input", () => {
    const result = dryRunSupabaseRealOperation({
      installationId: "inst-1",
      tenantId: "tenant-1",
      operation: "project.read",
      input: { projectRef: "abc", apiKey: "should-never-appear" },
      correlationId: "corr-1",
      requestedAt: new Date().toISOString(),
    });
    expect(JSON.stringify(result)).not.toContain("should-never-appear");
  });
});
