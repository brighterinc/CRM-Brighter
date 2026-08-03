import { describe, expect, it } from "vitest";

import {
  acknowledgeIncident,
  deriveIncidentsFromSnapshot,
  reopenIncident,
  resolveIncident,
} from "@/lib/monitoring/incidents";
import type { MonitoringCheckResult, MonitoringIncident, MonitoringSnapshot } from "@/lib/monitoring/types";

function makeSnapshot(checks: MonitoringCheckResult[]): MonitoringSnapshot {
  return {
    id: "snap-1",
    installationId: "install-1",
    tenantId: "tenant-1",
    plan: "dedicated",
    status: "completed",
    overallHealth: "degraded",
    score: 80,
    checks,
    incidents: [],
    blockers: [],
    warnings: [],
    missingCheckIds: [],
    lateCheckIds: [],
    createdAt: "2026-08-03T12:00:00.000Z",
  };
}

describe("deriveIncidentsFromSnapshot", () => {
  it("cria 1 incidente por check unhealthy/degraded", () => {
    const snapshot = makeSnapshot([
      { checkId: "database_reachable", status: "unhealthy", observedAt: "2026-08-03T12:00:00.000Z", message: "banco fora" },
      { checkId: "storage_available", status: "degraded", observedAt: "2026-08-03T12:00:00.000Z", message: "storage lento" },
      { checkId: "application_reachable", status: "healthy", observedAt: "2026-08-03T12:00:00.000Z", message: "ok" },
    ]);

    const incidents = deriveIncidentsFromSnapshot(snapshot);
    expect(incidents.length).toBe(2);
    expect(incidents.map((i) => i.sourceCheckId).sort()).toEqual(["database_reachable", "storage_available"]);
    expect(incidents.every((i) => i.status === "open")).toBe(true);
  });

  it("incidente crítico herda severity do check de origem", () => {
    const snapshot = makeSnapshot([
      { checkId: "database_reachable", status: "unhealthy", observedAt: "2026-08-03T12:00:00.000Z", message: "banco fora" },
    ]);
    const [incident] = deriveIncidentsFromSnapshot(snapshot);
    expect(incident.severity).toBe("critical");
  });

  it("incidente warning herda severity do check de origem", () => {
    const snapshot = makeSnapshot([
      { checkId: "storage_available", status: "degraded", observedAt: "2026-08-03T12:00:00.000Z", message: "lento" },
    ]);
    const [incident] = deriveIncidentsFromSnapshot(snapshot);
    expect(incident.severity).toBe("warning");
  });

  it("nunca duplica incidente já aberto pro mesmo sourceCheckId", () => {
    const snapshot = makeSnapshot([
      { checkId: "database_reachable", status: "unhealthy", observedAt: "2026-08-03T12:00:00.000Z", message: "banco fora" },
    ]);
    const existing: MonitoringIncident[] = [
      {
        id: "incident-existente",
        installationId: "install-1",
        tenantId: "tenant-1",
        title: "Banco de dados — indisponível",
        description: "banco fora",
        severity: "critical",
        status: "acknowledged",
        sourceCheckId: "database_reachable",
        openedAt: "2026-08-03T10:00:00.000Z",
      },
    ];

    const created = deriveIncidentsFromSnapshot(snapshot, existing);
    expect(created).toEqual([]);
  });

  it("cria novo incidente se o anterior pro mesmo check já foi resolvido", () => {
    const snapshot = makeSnapshot([
      { checkId: "database_reachable", status: "unhealthy", observedAt: "2026-08-03T12:00:00.000Z", message: "banco fora de novo" },
    ]);
    const existing: MonitoringIncident[] = [
      {
        id: "incident-resolvido",
        installationId: "install-1",
        tenantId: "tenant-1",
        title: "Banco de dados — indisponível",
        description: "banco fora (anterior)",
        severity: "critical",
        status: "resolved",
        sourceCheckId: "database_reachable",
        openedAt: "2026-08-03T08:00:00.000Z",
        resolvedAt: "2026-08-03T09:00:00.000Z",
      },
    ];

    const created = deriveIncidentsFromSnapshot(snapshot, existing);
    expect(created.length).toBe(1);
  });

  it("check em falha fora do catálogo é ignorado (nunca deveria acontecer, mas não quebra)", () => {
    const snapshot = makeSnapshot([
      { checkId: "check_fora_do_catalogo", status: "unhealthy", observedAt: "2026-08-03T12:00:00.000Z", message: "x" },
    ]);
    expect(deriveIncidentsFromSnapshot(snapshot)).toEqual([]);
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

describe("transições de incidente — funções puras", () => {
  it("acknowledgeIncident seta status e acknowledgedAt, nunca muta o original", () => {
    const original = makeIncident();
    const acked = acknowledgeIncident(original, "responsavel@empresa.invalid");

    expect(acked.status).toBe("acknowledged");
    expect(acked.acknowledgedAt).toBeDefined();
    expect(acked.assignedTo).toBe("responsavel@empresa.invalid");
    expect(original.status).toBe("open"); // nunca mutado
  });

  it("resolveIncident seta status e resolvedAt", () => {
    const acked = acknowledgeIncident(makeIncident());
    const resolved = resolveIncident(acked);
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).toBeDefined();
  });

  it("reopenIncident volta pra 'open' e limpa acknowledgedAt/resolvedAt", () => {
    const resolved = resolveIncident(acknowledgeIncident(makeIncident()));
    const reopened = reopenIncident(resolved);
    expect(reopened.status).toBe("open");
    expect(reopened.acknowledgedAt).toBeUndefined();
    expect(reopened.resolvedAt).toBeUndefined();
  });
});
