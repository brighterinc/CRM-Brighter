import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateDeploymentManifest } from "@/lib/deployment";
import {
  createPersistedInstallation,
  createPersistedTenant,
  recordProviderConnection,
  recordSecretReference,
  type ControlPlaneActorContext,
} from "@/lib/control-plane-persistence/services";
import type { ControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";
import { createDemoTenants } from "@/lib/tenants/repository";
import { attachDeploymentManifest } from "@/lib/tenants/validation";

import { createInMemoryProviderCredentialsRuntimeDeps } from "@/lib/provider-credentials-runtime/factory";
import type { InMemoryRuntimeVaultProvider } from "@/lib/provider-credentials-runtime/providers";
import { ProviderCredentialAccessDeniedError } from "@/lib/provider-credentials-runtime/errors";
import type { WithProviderCredentialDeps } from "@/lib/provider-credentials-runtime/runtime";

import {
  createRealSupabaseProvisioningAdapter,
  executeRealSupabaseOperation,
  RealProvisioningDisabledError,
  SupabaseManagementClient,
  SupabaseOperationNotRealSupportedError,
  type SupabaseRealExecutionDeps,
} from "@/lib/provisioning-adapters/providers/supabase-real";
import { resolveCredentialRequirementForSupabaseRealOperation } from "@/lib/provisioning-adapters/providers/supabase-real-operations";
import type { SupabaseRealAdapterRequest } from "@/lib/provisioning-adapters/providers/supabase-real-types";
import type { ProvisioningAdapterRequest } from "@/lib/provisioning-adapters/types";

const NOOP_CTX: ControlPlaneActorContext = { emitAudit: async () => {} };
const FAKE_TOKEN = "sbp_test-token-value-never-should-appear-anywhere";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

async function buildFixture(connectionStatus: "available" | "unavailable" = "available") {
  const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps({
    loadAdapterRequirement: resolveCredentialRequirementForSupabaseRealOperation,
  });

  const [demoTenant] = createDemoTenants();
  const manifest = generateDeploymentManifest({
    clientName: demoTenant!.clientName,
    clientSlug: demoTenant!.clientSlug,
    domain: demoTenant!.domain,
    plan: demoTenant!.plan,
    requestedModules: demoTenant!.requestedModules,
    branding: demoTenant!.branding,
  });
  const attached = attachDeploymentManifest(demoTenant!, manifest);
  if (!attached.ok) throw new Error("fixture inválida");

  const tenant = await createPersistedTenant(
    controlPlaneRepos,
    {
      clientName: demoTenant!.clientName,
      clientSlug: demoTenant!.clientSlug,
      domain: demoTenant!.domain,
      plan: demoTenant!.plan,
      requestedModules: demoTenant!.requestedModules,
      enabledModules: demoTenant!.enabledModules,
      branding: demoTenant!.branding,
      commercialStatus: demoTenant!.commercialStatus,
      technicalStatus: demoTenant!.technicalStatus,
    },
    NOOP_CTX,
  );
  const installation = await createPersistedInstallation(
    controlPlaneRepos,
    {
      slug: tenant.clientSlug,
      company: tenant.clientName,
      status: "provisioning",
      commercial: "contract",
      technical: "validated",
      tenant: { ...tenant, manifest: attached.tenant.manifest },
    },
    NOOP_CTX,
  );

  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    {
      installationId: installation.id,
      tenantId: tenant.id,
      reference: `supabase-mgmt-${randomUUID()}`,
      type: "api_key",
      provider: "supabase",
      vaultProvider: "in_memory",
      vaultKey: "test/supabase-key",
    },
    NOOP_CTX,
  );
  await recordProviderConnection(
    controlPlaneRepos,
    {
      installationId: installation.id,
      provider: "supabase",
      mode: "dry_run",
      status: connectionStatus,
      config: {},
      secretReferenceId: secretReference.id,
    },
    NOOP_CTX,
  );

  const inMemoryProvider = deps.vaultProviderRegistry.findProvider("in_memory") as InMemoryRuntimeVaultProvider;
  inMemoryProvider.seed(secretReference.id, FAKE_TOKEN);

  return { deps, controlPlaneRepos, installation, tenant };
}

function buildRequest(
  installationId: string,
  tenantId: string,
  operation: SupabaseRealAdapterRequest["operation"],
  input: Record<string, unknown> = {},
): SupabaseRealAdapterRequest {
  return { installationId, tenantId, operation, input, correlationId: randomUUID(), requestedAt: new Date().toISOString() };
}

function buildExecDeps(
  controlPlaneRepos: ControlPlaneRepositories,
  providerCredentialDeps: WithProviderCredentialDeps,
  fetchImpl: typeof fetch,
): SupabaseRealExecutionDeps {
  return {
    controlPlaneRepos,
    providerCredentialDeps,
    actorContext: NOOP_CTX,
    client: new SupabaseManagementClient({ fetchImpl, timeoutMs: 50 }),
    retryPolicy: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    sleep: async () => {},
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("executeRealSupabaseOperation — gate", () => {
  it("blocks with RealProvisioningDisabledError when REAL_PROVISIONING_ENABLED is not set (default) — nunca chama fetch", async () => {
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
    const fetchSpy = vi.fn();
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchSpy);
    const request = buildRequest(installation.id, tenant.id, "project.read", { projectRef: "proj_1" });

    await expect(executeRealSupabaseOperation(execDeps, request)).rejects.toBeInstanceOf(RealProvisioningDisabledError);
    expect(fetchSpy).not.toHaveBeenCalled();

    const events = await controlPlaneRepos.operationEvents.listByInstallation(installation.id);
    expect(events.some((e) => e.eventType === "provider_operation.blocked")).toBe(true);
  });

  it.each(["true", "TRUE", "1", "yes", "y", " true", "true ", ""] as const)(
    "rejects unexpected env value %j as disabled — only the exact string \"true\" enables execution",
    async (rawValue) => {
      if (rawValue === "true") {
        vi.stubEnv("REAL_PROVISIONING_ENABLED", rawValue);
        const { isRealProvisioningEnabled } = await import("@/lib/provisioning-adapters/providers/supabase-real-gate");
        expect(isRealProvisioningEnabled()).toBe(true);
        return;
      }
      vi.stubEnv("REAL_PROVISIONING_ENABLED", rawValue);
      const { isRealProvisioningEnabled } = await import("@/lib/provisioning-adapters/providers/supabase-real-gate");
      expect(isRealProvisioningEnabled()).toBe(false);
    },
  );

  it("absence of the env var is false, not undefined/truthy-by-coercion", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", undefined as unknown as string);
    delete process.env.REAL_PROVISIONING_ENABLED;
    const { isRealProvisioningEnabled } = await import("@/lib/provisioning-adapters/providers/supabase-real-gate");
    expect(isRealProvisioningEnabled()).toBe(false);
  });

  it("does NOT block dry-run when the gate is off", async () => {
    const { installation, tenant } = await buildFixture();
    const { dryRunSupabaseRealOperation } = await import("@/lib/provisioning-adapters/providers/supabase-real");
    const result = dryRunSupabaseRealOperation(buildRequest(installation.id, tenant.id, "project.read", { projectRef: "proj_1" }));
    expect(result.status).toBe("simulated");
  });
});

describe("executeRealSupabaseOperation — operação fora de escopo desta etapa", () => {
  it("blocks project.create even with the gate on (dry_run_only nesta etapa) — PROVA que fetch nunca é chamado", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
    const fetchSpy = vi.fn();
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchSpy);
    const request = buildRequest(installation.id, tenant.id, "project.create", { name: "n", organizationId: "o", region: "r" });

    await expect(executeRealSupabaseOperation(execDeps, request)).rejects.toBeInstanceOf(SupabaseOperationNotRealSupportedError);

    // Prova central desta etapa: mesmo com o gate ligado, NENHUMA chamada de
    // rede acontece pra project.create — o bloqueio ocorre ANTES de
    // qualquer credencial ser resolvida ou requisição HTTP ser montada.
    expect(fetchSpy).not.toHaveBeenCalled();

    const events = await controlPlaneRepos.operationEvents.listByInstallation(installation.id);
    expect(events.some((e) => e.eventType === "provider_operation.blocked")).toBe(true);
    for (const event of events) {
      expect(JSON.stringify(event)).not.toContain(FAKE_TOKEN);
    }
  });

  it("blocks project.create through the ProvisioningProviderAdapter bridge too — mesma prova, outro entry point", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
    const fetchSpy = vi.fn();
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchSpy);
    const adapter = createRealSupabaseProvisioningAdapter(execDeps);

    const provisioningRequest: ProvisioningAdapterRequest = {
      installationId: installation.id,
      tenantId: tenant.id,
      stepId: "step-supabase-create",
      provider: "supabase",
      operation: "project.create",
      mode: "dry_run",
      input: { name: "n", organizationId: "o", region: "r" },
      idempotencyKey: randomUUID(),
      requestedAt: new Date().toISOString(),
    };

    await expect(adapter.executeReal(provisioningRequest)).rejects.toBeInstanceOf(SupabaseOperationNotRealSupportedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(["database.prepare", "auth.configure", "storage.prepare", "edge_functions.prepare"] as const)(
    "blocks %s (planned) even with the gate on — nunca chama fetch",
    async (operation) => {
      vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
      const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
      const fetchSpy = vi.fn();
      const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchSpy);
      const request = buildRequest(installation.id, tenant.id, operation, { projectRef: "proj_1" });

      await expect(executeRealSupabaseOperation(execDeps, request)).rejects.toBeInstanceOf(SupabaseOperationNotRealSupportedError);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});

describe("executeRealSupabaseOperation — provider credentials integration", () => {
  it("propagates ProviderCredentialAccessDeniedError when there is no provider connection at all", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps({
      loadAdapterRequirement: resolveCredentialRequirementForSupabaseRealOperation,
    });
    const execDeps = buildExecDeps(controlPlaneRepos, deps, vi.fn());
    const request = buildRequest("no-such-installation", "no-such-tenant", "project.read", { projectRef: "proj_1" });

    await expect(executeRealSupabaseOperation(execDeps, request)).rejects.toBeInstanceOf(ProviderCredentialAccessDeniedError);
  });

  it("denies access when the provider connection is not available", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture("unavailable");
    const execDeps = buildExecDeps(controlPlaneRepos, deps, vi.fn());
    const request = buildRequest(installation.id, tenant.id, "project.read", { projectRef: "proj_1" });

    await expect(executeRealSupabaseOperation(execDeps, request)).rejects.toBeInstanceOf(ProviderCredentialAccessDeniedError);
  });
});

describe("executeRealSupabaseOperation — chamadas reais (fetch mockado)", () => {
  it("project.read succeeds and maps the response — never logs/returns the secret", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();

    let capturedAuthHeader: string | null = null;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedAuthHeader = (init?.headers as Record<string, string>)?.Authorization ?? null;
      return jsonResponse(200, { id: "proj_123", name: "Acme", region: "us-east-1", status: "ACTIVE_HEALTHY", organization_id: "org_1", created_at: "2026-01-01T00:00:00Z" });
    });
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchImpl as unknown as typeof fetch);
    const request = buildRequest(installation.id, tenant.id, "project.read", { projectRef: "proj_123" });

    const result = await executeRealSupabaseOperation(execDeps, request);

    expect(result.status).toBe("ready");
    expect(result.mode).toBe("real");
    expect(result.output.id).toBe("proj_123");
    expect(capturedAuthHeader).toBe(`Bearer ${FAKE_TOKEN}`);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(FAKE_TOKEN);

    const events = await controlPlaneRepos.operationEvents.listByInstallation(installation.id);
    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining(["provider_operation.requested", "provider_operation.started", "provider_operation.completed"]),
    );
    for (const event of events) {
      expect(JSON.stringify(event)).not.toContain(FAKE_TOKEN);
      expect(JSON.stringify(event.metadata)).not.toMatch(/secret|password|token/i);
    }
  });

  it("project.status maps project.read shape too", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
    const fetchImpl = vi.fn(async () => jsonResponse(200, { id: "proj_123", status: "ACTIVE_HEALTHY" }));
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchImpl as unknown as typeof fetch);
    const request = buildRequest(installation.id, tenant.id, "project.status", { projectRef: "proj_123" });

    const result = await executeRealSupabaseOperation(execDeps, request);
    expect(result.output.status).toBe("ACTIVE_HEALTHY");
  });

  it("project.validate without projectRef calls listProjects instead of getProject", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("/v1/projects");
      return jsonResponse(200, [{ id: "p1" }, { id: "p2" }]);
    });
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchImpl as unknown as typeof fetch);
    const request = buildRequest(installation.id, tenant.id, "project.validate", {});

    const result = await executeRealSupabaseOperation(execDeps, request);
    expect(result.status).toBe("ready");
  });

  it("project.read raises SupabaseProjectNotFoundError on 404 — no retry", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return jsonResponse(404, { message: "not found" });
    });
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchImpl as unknown as typeof fetch);
    const request = buildRequest(installation.id, tenant.id, "project.read", { projectRef: "missing-project" });

    await expect(executeRealSupabaseOperation(execDeps, request)).rejects.toMatchObject({ name: "SupabaseProjectNotFoundError" });
    expect(calls).toBe(1);

    const events = await controlPlaneRepos.operationEvents.listByInstallation(installation.id);
    expect(events.some((e) => e.eventType === "provider_operation.failed")).toBe(true);
  });

  it("project.read raises SupabaseProjectConflictError on 409 — no retry", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return jsonResponse(409, { message: "conflict" });
    });
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchImpl as unknown as typeof fetch);
    const request = buildRequest(installation.id, tenant.id, "project.read", { projectRef: "proj_1" });

    await expect(executeRealSupabaseOperation(execDeps, request)).rejects.toMatchObject({ name: "SupabaseProjectConflictError" });
    expect(calls).toBe(1);
  });

  it("project.read raises SupabaseCredentialInvalidError on 401 — no retry", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return jsonResponse(401, { message: "invalid token" });
    });
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchImpl as unknown as typeof fetch);
    const request = buildRequest(installation.id, tenant.id, "project.read", { projectRef: "proj_1" });

    await expect(executeRealSupabaseOperation(execDeps, request)).rejects.toMatchObject({ name: "SupabaseCredentialInvalidError" });
    expect(calls).toBe(1);
  });

  it("project.read raises SupabaseAccessDeniedError on 403 — no retry", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return jsonResponse(403, { message: "forbidden" });
    });
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchImpl as unknown as typeof fetch);
    const request = buildRequest(installation.id, tenant.id, "project.read", { projectRef: "proj_1" });

    await expect(executeRealSupabaseOperation(execDeps, request)).rejects.toMatchObject({ name: "SupabaseAccessDeniedError" });
    expect(calls).toBe(1);
  });

  it("project.read retries on 429 and eventually succeeds", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) return jsonResponse(429, { message: "rate limited" }, { "retry-after": "1" });
      return jsonResponse(200, { id: "proj_1", status: "ACTIVE_HEALTHY" });
    });
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchImpl as unknown as typeof fetch);
    const request = buildRequest(installation.id, tenant.id, "project.read", { projectRef: "proj_1" });

    const result = await executeRealSupabaseOperation(execDeps, request);
    expect(result.status).toBe("ready");
    expect(result.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it("project.read times out and raises SupabaseTimeoutError", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () => {
          const err = new DOMException("aborted", "AbortError");
          reject(err);
        });
      });
    });
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchImpl as unknown as typeof fetch);
    const request = buildRequest(installation.id, tenant.id, "project.read", { projectRef: "proj_1" });

    await expect(executeRealSupabaseOperation(execDeps, request)).rejects.toMatchObject({ name: "SupabaseTimeoutError" });
  }, 10_000);

  it("idempotency key is identical for the same input regardless of call order", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
    const fetchImpl = vi.fn(async () => jsonResponse(200, { id: "proj_1", status: "ACTIVE_HEALTHY" }));
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchImpl as unknown as typeof fetch);

    const resultA = await executeRealSupabaseOperation(execDeps, buildRequest(installation.id, tenant.id, "project.read", { projectRef: "proj_1" }));
    const resultB = await executeRealSupabaseOperation(execDeps, buildRequest(installation.id, tenant.id, "project.read", { projectRef: "proj_1" }));

    expect(resultA.idempotencyKey).toBe(resultB.idempotencyKey);
  });
});

describe("createRealSupabaseProvisioningAdapter — integração com Provisioning Adapters", () => {
  it("dryRun/rollbackPreview funcionam sem gate/rede; executeReal é gated", async () => {
    vi.unstubAllEnvs();
    const { deps, controlPlaneRepos, installation, tenant } = await buildFixture();
    const fetchImpl = vi.fn(async () => jsonResponse(200, { id: "proj_1", status: "ACTIVE_HEALTHY" }));
    const execDeps = buildExecDeps(controlPlaneRepos, deps, fetchImpl as unknown as typeof fetch);
    const adapter = createRealSupabaseProvisioningAdapter(execDeps);

    expect(adapter.providerId).toBe("supabase");
    expect(adapter.supports("project.read")).toBe(true);
    expect(adapter.capabilities().length).toBe(8);

    const provisioningRequest: ProvisioningAdapterRequest = {
      installationId: installation.id,
      tenantId: tenant.id,
      stepId: "step-supabase-read",
      provider: "supabase",
      operation: "project.read",
      mode: "dry_run",
      input: { projectRef: "proj_1" },
      idempotencyKey: randomUUID(),
      requestedAt: new Date().toISOString(),
    };

    expect(adapter.validate(provisioningRequest)).toEqual({ valid: true, errors: [] });

    const dryRunResult = await adapter.dryRun(provisioningRequest);
    expect(dryRunResult.status).toBe("simulated");

    // Gate off — executeReal deve bloquear mesmo com credencial válida.
    await expect(adapter.executeReal(provisioningRequest)).rejects.toBeInstanceOf(RealProvisioningDisabledError);

    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    const realResult = await adapter.executeReal(provisioningRequest);
    expect(realResult.status).toBe("ready");
    expect(realResult.provider).toBe("supabase");
  });

  it("rollbackPreview for project.create flags human approval", () => {
    const dummyDeps = {} as SupabaseRealExecutionDeps;
    const adapter = createRealSupabaseProvisioningAdapter(dummyDeps);
    const preview = adapter.rollbackPreview({
      installationId: "i",
      tenantId: "t",
      stepId: "s",
      provider: "supabase",
      operation: "project.create",
      mode: "dry_run",
      input: {},
      idempotencyKey: "k",
      requestedAt: new Date().toISOString(),
    });
    expect(preview.reversible).toBe(true);
    expect(preview.warnings.join(" ")).not.toMatch(/token|secret/i);
  });
});
