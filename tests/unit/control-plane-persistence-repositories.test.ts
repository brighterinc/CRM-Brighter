import { describe, expect, it } from "vitest";

import { UnsafePersistencePayloadError } from "@/lib/control-plane-persistence/safe-persistence";
import {
  InMemoryDeploymentRepository,
  InMemoryOperationEventRepository,
  InMemoryProviderConnectionRepository,
  InMemoryProvisioningRepository,
} from "@/lib/control-plane-persistence/repositories/in-memory";

describe("InMemoryDeploymentRepository", () => {
  it("recordDeployment recusa manifestSnapshot com chave sensível", async () => {
    const repo = new InMemoryDeploymentRepository();
    await expect(
      repo.recordDeployment({
        target: "vercel",
        plan: "lite",
        manifestFingerprint: "fp",
        manifestSnapshot: { serviceRoleKey: "nunca" },
      }),
    ).rejects.toThrow(UnsafePersistencePayloadError);
  });

  it("findLatestByInstallation devolve o mais recente por generatedAt", async () => {
    const repo = new InMemoryDeploymentRepository();
    await repo.recordDeployment({ installationId: "i1", target: "vercel", plan: "lite", manifestFingerprint: "fp1", manifestSnapshot: {} });
    await new Promise((r) => setTimeout(r, 2));
    const second = await repo.recordDeployment({ installationId: "i1", target: "vercel", plan: "lite", manifestFingerprint: "fp2", manifestSnapshot: {} });
    const latest = await repo.findLatestByInstallation("i1");
    expect(latest?.id).toBe(second.id);
  });

  it("listByInstallation nunca mistura instalações diferentes", async () => {
    const repo = new InMemoryDeploymentRepository();
    await repo.recordDeployment({ installationId: "i1", target: "vercel", plan: "lite", manifestFingerprint: "fp1", manifestSnapshot: {} });
    await repo.recordDeployment({ installationId: "i2", target: "vercel", plan: "lite", manifestFingerprint: "fp2", manifestSnapshot: {} });
    expect(await repo.listByInstallation("i1")).toHaveLength(1);
  });
});

describe("InMemoryProvisioningRepository — idempotência de step", () => {
  it("upsertStep com o mesmo (runId, stepId) atualiza, nunca duplica", async () => {
    const repo = new InMemoryProvisioningRepository();
    const run = await repo.createRun({
      installationId: "i1",
      tenantId: "t1",
      plan: "lite",
      target: "vercel",
      manifestFingerprint: "fp",
      status: "running",
    });

    await repo.upsertStep({ runId: run.id, stepId: "database_provision", category: "database", status: "pending", attempts: 1 });
    await repo.upsertStep({ runId: run.id, stepId: "database_provision", category: "database", status: "completed", attempts: 2 });

    const steps = await repo.listSteps(run.id);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.status).toBe("completed");
    expect(steps[0]?.attempts).toBe(2);
  });

  it("steps de runs diferentes com o mesmo stepId nunca colidem", async () => {
    const repo = new InMemoryProvisioningRepository();
    const runA = await repo.createRun({ installationId: "i1", tenantId: "t1", plan: "lite", target: "vercel", manifestFingerprint: "fp", status: "running" });
    const runB = await repo.createRun({ installationId: "i2", tenantId: "t2", plan: "lite", target: "vercel", manifestFingerprint: "fp", status: "running" });

    await repo.upsertStep({ runId: runA.id, stepId: "database_provision", category: "database", status: "pending", attempts: 0 });
    await repo.upsertStep({ runId: runB.id, stepId: "database_provision", category: "database", status: "completed", attempts: 0 });

    expect((await repo.listSteps(runA.id))[0]?.status).toBe("pending");
    expect((await repo.listSteps(runB.id))[0]?.status).toBe("completed");
  });

  it("updateRunStatus muda status sem tocar demais campos", async () => {
    const repo = new InMemoryProvisioningRepository();
    const run = await repo.createRun({ installationId: "i1", tenantId: "t1", plan: "pro", target: "vercel", manifestFingerprint: "fp", status: "draft" });
    const updated = await repo.updateRunStatus(run.id, "completed");
    expect(updated.status).toBe("completed");
    expect(updated.plan).toBe("pro");
  });
});

describe("InMemoryProviderConnectionRepository — upsert por (installationId, provider)", () => {
  it("recordConnection repetida pro mesmo (installation, provider) atualiza, nunca duplica", async () => {
    const repo = new InMemoryProviderConnectionRepository();
    await repo.recordConnection({ installationId: "i1", provider: "supabase", mode: "dry_run", status: "available", config: {} });
    await repo.recordConnection({ installationId: "i1", provider: "supabase", mode: "simulation", status: "planned", config: { region: "sa-east-1" } });

    const list = await repo.listByInstallation("i1");
    expect(list).toHaveLength(1);
    expect(list[0]?.mode).toBe("simulation");
  });

  it("recordConnection recusa config com chave sensível", async () => {
    const repo = new InMemoryProviderConnectionRepository();
    await expect(
      repo.recordConnection({ installationId: "i1", provider: "supabase", mode: "dry_run", status: "available", config: { apiKey: "x" } }),
    ).rejects.toThrow(UnsafePersistencePayloadError);
  });
});

describe("InMemoryOperationEventRepository", () => {
  it("recordEvent recusa metadata com chave sensível", async () => {
    const repo = new InMemoryOperationEventRepository();
    await expect(
      repo.recordEvent({ eventType: "x", severity: "info", message: "m", metadata: { token: "x" } }),
    ).rejects.toThrow(UnsafePersistencePayloadError);
  });

  it("listRecent ordena por occurredAt desc, cruzando instalações", async () => {
    const repo = new InMemoryOperationEventRepository();
    await repo.recordEvent({ installationId: "i1", eventType: "a", severity: "info", message: "1" });
    await new Promise((r) => setTimeout(r, 2));
    await repo.recordEvent({ installationId: "i2", eventType: "b", severity: "info", message: "2" });

    const recent = await repo.listRecent(10);
    expect(recent[0]?.message).toBe("2");
    expect(recent).toHaveLength(2);
  });

  it("listByInstallation/listByTenant filtram corretamente", async () => {
    const repo = new InMemoryOperationEventRepository();
    await repo.recordEvent({ installationId: "i1", tenantId: "t1", eventType: "a", severity: "info", message: "1" });
    await repo.recordEvent({ installationId: "i2", tenantId: "t2", eventType: "b", severity: "info", message: "2" });

    expect(await repo.listByInstallation("i1")).toHaveLength(1);
    expect(await repo.listByTenant("t2")).toHaveLength(1);
  });
});
