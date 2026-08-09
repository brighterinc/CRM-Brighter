import { describe, expect, it } from "vitest";

import {
  ChatwootProvisioningProviderAdapter,
  DnsProvisioningProviderAdapter,
  DockerProvisioningProviderAdapter,
  EmailProvisioningProviderAdapter,
  EvolutionProvisioningProviderAdapter,
  FakeProvisioningProviderAdapter,
  NoopProvisioningProviderAdapter,
  RealProvisioningDisabledError,
  RedisProvisioningProviderAdapter,
  ReverseProxyProvisioningProviderAdapter,
  SupabaseProvisioningProviderAdapter,
  VercelProvisioningProviderAdapter,
  VpsProvisioningProviderAdapter,
  WahaProvisioningProviderAdapter,
  WhatsappProvisioningProviderAdapter,
} from "@/lib/provisioning-adapters";
import type { ProvisioningAdapterRequest, ProvisioningProviderAdapter } from "@/lib/provisioning-adapters";

const ALL_ADAPTERS: ProvisioningProviderAdapter[] = [
  NoopProvisioningProviderAdapter,
  FakeProvisioningProviderAdapter,
  SupabaseProvisioningProviderAdapter,
  VercelProvisioningProviderAdapter,
  DnsProvisioningProviderAdapter,
  VpsProvisioningProviderAdapter,
  DockerProvisioningProviderAdapter,
  ReverseProxyProvisioningProviderAdapter,
  RedisProvisioningProviderAdapter,
  EmailProvisioningProviderAdapter,
  WhatsappProvisioningProviderAdapter,
  ChatwootProvisioningProviderAdapter,
  EvolutionProvisioningProviderAdapter,
  WahaProvisioningProviderAdapter,
];

function requestFor(adapter: ProvisioningProviderAdapter, operation: string): ProvisioningAdapterRequest {
  return {
    installationId: "inst-1",
    tenantId: "tenant-1",
    stepId: "test-step",
    provider: adapter.providerId,
    operation,
    mode: "dry_run",
    input: {},
    idempotencyKey: "padk_test",
    requestedAt: "2026-08-09T00:00:00.000Z",
  };
}

describe("blueprints de provider — os 14", () => {
  it.each(ALL_ADAPTERS)("$providerId: executeReal SEMPRE lança RealProvisioningDisabledError", async (adapter) => {
    const capability = adapter.capabilities()[0];
    expect(capability).toBeDefined();
    await expect(adapter.executeReal(requestFor(adapter, capability!.operation))).rejects.toThrow(RealProvisioningDisabledError);
  });

  it.each(ALL_ADAPTERS)("$providerId: dryRun de toda capability declarada devolve ready/simulated, nunca lança", async (adapter) => {
    for (const capability of adapter.capabilities()) {
      const result = await adapter.dryRun(requestFor(adapter, capability.operation));
      expect(["ready", "simulated"]).toContain(result.status);
      expect(result.provider).toBe(adapter.providerId);
    }
  });

  it.each(ALL_ADAPTERS)("$providerId: dryRun de operação não suportada devolve blocked", async (adapter) => {
    const result = await adapter.dryRun(requestFor(adapter, "operacao.inexistente"));
    expect(result.status).toBe("blocked");
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it.each(ALL_ADAPTERS)("$providerId: nenhum output/rollback contém segredo", async (adapter) => {
    for (const capability of adapter.capabilities()) {
      const result = await adapter.dryRun(requestFor(adapter, capability.operation));
      expect(JSON.stringify(result)).not.toMatch(/serviceRole|password|apiKey|secret/i);
    }
  });

  it("sentinela __simulateFailure produz status failed (só usado por simulation.ts)", async () => {
    const request = { ...requestFor(SupabaseProvisioningProviderAdapter, "project.create"), input: { __simulateFailure: true } };
    const result = await SupabaseProvisioningProviderAdapter.dryRun(request);
    expect(result.status).toBe("failed");
  });
});

describe("Fake adapter — determinístico", () => {
  it("mesmo input produz o mesmo output (exceto requestId/completedAt)", async () => {
    const request = requestFor(FakeProvisioningProviderAdapter, "simulate");
    const a = await FakeProvisioningProviderAdapter.dryRun(request);
    const b = await FakeProvisioningProviderAdapter.dryRun(request);
    expect(a.output).toEqual(b.output);
  });
});
