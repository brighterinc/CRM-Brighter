import { describe, expect, it } from "vitest";

import { InMemoryProvisioningAdapterRepository } from "@/lib/provisioning-adapters";
import type { ProvisioningAdapterRequest, ProvisioningAdapterResult } from "@/lib/provisioning-adapters";

const REQUEST: ProvisioningAdapterRequest = {
  installationId: "inst-1",
  tenantId: "tenant-1",
  stepId: "create_supabase_project",
  provider: "supabase",
  operation: "project.create",
  mode: "dry_run",
  input: {},
  idempotencyKey: "padk_abc123",
  requestedAt: "2026-08-09T00:00:00.000Z",
};

const RESULT: ProvisioningAdapterResult = {
  requestId: "req-1",
  provider: "supabase",
  operation: "project.create",
  status: "ready",
  output: {},
  blockers: [],
  warnings: [],
  rollbackAvailable: true,
  completedAt: "2026-08-09T00:00:01.000Z",
};

describe("InMemoryProvisioningAdapterRepository", () => {
  it("salva e encontra request por idempotencyKey", async () => {
    const repo = new InMemoryProvisioningAdapterRepository();
    await repo.saveRequest(REQUEST);
    expect(await repo.findRequest(REQUEST.idempotencyKey)).toEqual(REQUEST);
    expect(await repo.findRequest("chave-inexistente")).toBeNull();
  });

  it("salva e encontra result por requestId e por idempotencyKey", async () => {
    const repo = new InMemoryProvisioningAdapterRepository();
    await repo.saveResult(RESULT, REQUEST.idempotencyKey);
    expect(await repo.findResult(RESULT.requestId)).toEqual(RESULT);
    expect(await repo.findByIdempotencyKey(REQUEST.idempotencyKey)).toEqual(RESULT);
    expect(await repo.findByIdempotencyKey("chave-inexistente")).toBeNull();
  });

  it("listRequests/listResults devolvem tudo que foi salvo", async () => {
    const repo = new InMemoryProvisioningAdapterRepository();
    await repo.saveRequest(REQUEST);
    await repo.saveResult(RESULT, REQUEST.idempotencyKey);
    expect(await repo.listRequests()).toHaveLength(1);
    expect(await repo.listResults()).toHaveLength(1);
  });

  it("cada instância começa vazia — nunca compartilha estado", async () => {
    const repoA = new InMemoryProvisioningAdapterRepository();
    const repoB = new InMemoryProvisioningAdapterRepository();
    await repoA.saveRequest(REQUEST);
    expect(await repoB.listRequests()).toEqual([]);
  });
});
