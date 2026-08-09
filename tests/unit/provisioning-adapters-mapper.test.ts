import { describe, expect, it } from "vitest";

import { buildAdapterIdempotencyKey, createDefaultProvisioningAdapterRegistry, mapProvisioningStepToAdapterRequest } from "@/lib/provisioning-adapters";

const BASE_PLAN = { plan: "dedicated" as const, target: "vps" as const, manifestFingerprint: "prov_fingerprint123" };

describe("mapProvisioningStepToAdapterRequest", () => {
  it("resolve etapa mapeada — request sanitizado, com idempotencyKey", () => {
    const registry = createDefaultProvisioningAdapterRegistry();
    const result = mapProvisioningStepToAdapterRequest({
      installationId: "inst-1",
      tenantId: "tenant-1",
      plan: BASE_PLAN,
      stepId: "create_supabase_project",
      registry,
    });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.request.provider).toBe("supabase");
    expect(result.request.operation).toBe("project.create");
    expect(result.request.mode).toBe("dry_run");
    expect(result.request.idempotencyKey).toMatch(/^padk_/);
    expect(result.request.input).not.toHaveProperty("serviceRoleKey");
  });

  it("etapa sem provider nesta Foundation devolve unmapped", () => {
    const registry = createDefaultProvisioningAdapterRegistry();
    const result = mapProvisioningStepToAdapterRequest({
      installationId: "inst-1",
      tenantId: "tenant-1",
      plan: BASE_PLAN,
      stepId: "validate_tenant",
      registry,
    });
    expect(result.status).toBe("unmapped");
  });

  it("etapa mapeada sem adapter registrado devolve missing_adapter", () => {
    const registry = createDefaultProvisioningAdapterRegistry();
    registry.unregisterAdapter("redis");
    const result = mapProvisioningStepToAdapterRequest({
      installationId: "inst-1",
      tenantId: "tenant-1",
      plan: BASE_PLAN,
      stepId: "configure_redis",
      registry,
    });
    expect(result.status).toBe("missing_adapter");
  });

  it("capability incompatível com o plano devolve incompatible_plan", () => {
    const registry = createDefaultProvisioningAdapterRegistry();
    // vercel só suporta lite/pro — força um plano "dedicated" pra provocar incompatibilidade
    const result = mapProvisioningStepToAdapterRequest({
      installationId: "inst-1",
      tenantId: "tenant-1",
      plan: { plan: "dedicated", target: "vercel", manifestFingerprint: "fp" },
      stepId: "create_frontend_project",
      registry,
    });
    expect(result.status).toBe("incompatible_plan");
  });

  it("nunca lê process.env — vercel-frontend nem cita env vars sensíveis", () => {
    const registry = createDefaultProvisioningAdapterRegistry();
    const result = mapProvisioningStepToAdapterRequest({
      installationId: "inst-1",
      tenantId: "tenant-1",
      plan: { plan: "pro", target: "vercel", manifestFingerprint: "fp" },
      stepId: "create_frontend_project",
      registry,
      extraInput: { note: "sem segredo" },
    });
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(JSON.stringify(result.request.input)).not.toMatch(/token|secret|password|serviceRole/i);
  });
});

describe("buildAdapterIdempotencyKey", () => {
  it("mesmo input produz a mesma chave", () => {
    const input = {
      tenantId: "t1",
      installationId: "i1",
      stepId: "create_supabase_project",
      provider: "supabase" as const,
      operation: "project.create",
      input: { a: 1, b: 2 },
      planFingerprint: "fp1",
    };
    expect(buildAdapterIdempotencyKey(input)).toBe(buildAdapterIdempotencyKey(input));
  });

  it("ordem de chave do objeto de input não muda a chave (serialização estável)", () => {
    const a = buildAdapterIdempotencyKey({
      tenantId: "t1",
      installationId: "i1",
      stepId: "s",
      provider: "supabase",
      operation: "project.create",
      input: { a: 1, b: 2 },
      planFingerprint: "fp1",
    });
    const b = buildAdapterIdempotencyKey({
      tenantId: "t1",
      installationId: "i1",
      stepId: "s",
      provider: "supabase",
      operation: "project.create",
      input: { b: 2, a: 1 },
      planFingerprint: "fp1",
    });
    expect(a).toBe(b);
  });

  it("input diferente produz chave diferente", () => {
    const base = {
      tenantId: "t1",
      installationId: "i1",
      stepId: "s",
      provider: "supabase" as const,
      operation: "project.create",
      planFingerprint: "fp1",
    };
    expect(buildAdapterIdempotencyKey({ ...base, input: { a: 1 } })).not.toBe(buildAdapterIdempotencyKey({ ...base, input: { a: 2 } }));
  });
});
