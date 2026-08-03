import { describe, expect, it } from "vitest";

import { createDemoInstallations } from "@/lib/control-plane/repository";
import { simulateMonitoringRun } from "@/lib/monitoring/evaluator";
import {
  createDemoMonitoringSnapshots,
  InMemoryMonitoringRepository,
  MonitoringIncidentNotFoundError,
  MonitoringSnapshotValidationFailedError,
} from "@/lib/monitoring/repository";
import type { MonitoringIncident } from "@/lib/monitoring/types";

describe("InMemoryMonitoringRepository — snapshots", () => {
  it("saveSnapshot + listSnapshots por installationId", async () => {
    const repo = new InMemoryMonitoringRepository();
    const installation = createDemoInstallations()[0]!;
    const snapshot = simulateMonitoringRun(installation, "healthy");

    await repo.saveSnapshot(snapshot);
    const all = await repo.listSnapshots(installation.id);
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(snapshot.id);
  });

  it("findLatestByInstallation devolve o snapshot mais recente", async () => {
    const repo = new InMemoryMonitoringRepository();
    const installation = createDemoInstallations()[0]!;
    const older = { ...simulateMonitoringRun(installation, "healthy"), id: "snap-old", createdAt: "2026-01-01T00:00:00.000Z" };
    const newer = { ...simulateMonitoringRun(installation, "healthy"), id: "snap-new", createdAt: "2026-08-03T00:00:00.000Z" };

    await repo.saveSnapshot(older);
    await repo.saveSnapshot(newer);

    const latest = await repo.findLatestByInstallation(installation.id);
    expect(latest?.id).toBe("snap-new");
  });

  it("findLatestByInstallation devolve null se não há snapshot", async () => {
    const repo = new InMemoryMonitoringRepository();
    expect(await repo.findLatestByInstallation("instalacao-inexistente")).toBeNull();
  });

  it("saveSnapshot rejeita snapshot estruturalmente inválido", async () => {
    const repo = new InMemoryMonitoringRepository();
    const installation = createDemoInstallations()[0]!;
    const invalid = { ...simulateMonitoringRun(installation, "healthy"), score: 999 };
    await expect(repo.saveSnapshot(invalid)).rejects.toThrow(MonitoringSnapshotValidationFailedError);
  });
});

function makeIncident(overrides: Partial<MonitoringIncident> = {}): MonitoringIncident {
  return {
    id: "incident-1",
    installationId: "install-1",
    tenantId: "tenant-1",
    title: "Banco de dados — indisponível",
    description: "banco fora",
    severity: "critical",
    status: "open",
    sourceCheckId: "database_reachable",
    openedAt: "2026-08-03T12:00:00.000Z",
    ...overrides,
  };
}

describe("InMemoryMonitoringRepository — incidentes", () => {
  it("saveIncident + findIncident + listIncidents por installationId", async () => {
    const repo = new InMemoryMonitoringRepository();
    const incident = makeIncident();
    await repo.saveIncident(incident);

    expect(await repo.findIncident(incident.id)).toEqual(incident);
    expect(await repo.listIncidents(incident.installationId)).toEqual([incident]);
    expect(await repo.listIncidents("outra-instalacao")).toEqual([]);
  });

  it("updateIncident aplica patch e preserva o resto", async () => {
    const repo = new InMemoryMonitoringRepository();
    await repo.saveIncident(makeIncident());

    const updated = await repo.updateIncident("incident-1", { status: "acknowledged", assignedTo: "alguem@empresa.invalid" });
    expect(updated.status).toBe("acknowledged");
    expect(updated.assignedTo).toBe("alguem@empresa.invalid");
    expect(updated.sourceCheckId).toBe("database_reachable");
  });

  it("updateIncident em id inexistente lança MonitoringIncidentNotFoundError", async () => {
    const repo = new InMemoryMonitoringRepository();
    await expect(repo.updateIncident("nao-existe", { status: "resolved" })).rejects.toThrow(MonitoringIncidentNotFoundError);
  });

  it("cada instância nasce vazia — nunca singleton global", async () => {
    const repoA = new InMemoryMonitoringRepository();
    const repoB = new InMemoryMonitoringRepository();
    await repoA.saveIncident(makeIncident());
    expect(await repoB.listIncidents()).toEqual([]);
  });
});

describe("createDemoMonitoringSnapshots", () => {
  it("gera 1 snapshot saudável por instalação de demonstração", () => {
    const installations = createDemoInstallations();
    const snapshots = createDemoMonitoringSnapshots(installations);
    expect(snapshots).toHaveLength(installations.length);
    expect(snapshots.every((s) => s.overallHealth === "healthy")).toBe(true);
  });
});
