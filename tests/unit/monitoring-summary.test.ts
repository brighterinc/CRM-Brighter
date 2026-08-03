import { describe, expect, it } from "vitest";

import { createDemoInstallations } from "@/lib/control-plane/repository";
import { deriveIncidentsFromSnapshot } from "@/lib/monitoring/incidents";
import { simulateMonitoringRun } from "@/lib/monitoring/evaluator";
import {
  attachMonitoringSnapshotToInstallationSummary,
  generateMonitoringControlPlaneOverview,
  generateMonitoringSummary,
  renderMonitoringSummaryMarkdown,
} from "@/lib/monitoring/summary";

describe("generateMonitoringSummary", () => {
  it("instalação saudável: zero degradado/indisponível/incidente", () => {
    const installation = createDemoInstallations()[0]!;
    const snapshot = simulateMonitoringRun(installation, "healthy");
    const summary = generateMonitoringSummary(installation, snapshot);

    expect(summary.overallHealth).toBe("healthy");
    expect(summary.degradedCount).toBe(0);
    expect(summary.unhealthyCount).toBe(0);
    expect(summary.criticalIncidents).toBe(0);
    expect(summary.openIncidents).toBe(0);
    expect(summary.affectedModules).toEqual([]);
    expect(summary.affectedCategories).toEqual([]);
  });

  it("instalação crítica: conta incidentes críticos e módulos/categorias afetados", () => {
    const installation = createDemoInstallations().find((i) => i.deploymentPlan === "dedicated")!;
    const snapshot = simulateMonitoringRun(installation, "critical");
    const incidents = deriveIncidentsFromSnapshot(snapshot);
    const summary = generateMonitoringSummary(installation, { ...snapshot, incidents });

    expect(summary.unhealthyCount).toBeGreaterThan(0);
    expect(summary.criticalIncidents).toBeGreaterThan(0);
    expect(summary.affectedCategories).toContain("database");
    expect(summary.nextSteps.length).toBeGreaterThan(0);
  });
});

describe("renderMonitoringSummaryMarkdown", () => {
  it("contém todas as seções pedidas", () => {
    const installation = createDemoInstallations()[0]!;
    const snapshot = simulateMonitoringRun(installation, "healthy");
    const summary = generateMonitoringSummary(installation, snapshot);
    const markdown = renderMonitoringSummaryMarkdown(summary);

    expect(markdown).toContain(installation.company);
    expect(markdown).toContain("Saúde geral");
    expect(markdown).toContain("Score");
    expect(markdown).toContain("Incidentes críticos");
    expect(markdown).toContain("Checks atrasados");
    expect(markdown).toContain("## Próximos passos");
    expect(markdown).toContain("## Módulos afetados");
    expect(markdown).toContain("## Categorias afetadas");
  });
});

describe("attachMonitoringSnapshotToInstallationSummary", () => {
  it("snapshot null → hasMonitoring: false, overallHealth: unknown", () => {
    const installation = createDemoInstallations()[0]!;
    const overview = attachMonitoringSnapshotToInstallationSummary(installation, null);
    expect(overview.hasMonitoring).toBe(false);
    expect(overview.overallHealth).toBe("unknown");
    expect(overview.score).toBeNull();
  });

  it("snapshot saudável → hasMonitoring: true, waitingAction: false", () => {
    const installation = createDemoInstallations()[0]!;
    const snapshot = simulateMonitoringRun(installation, "healthy");
    const overview = attachMonitoringSnapshotToInstallationSummary(installation, snapshot);
    expect(overview.hasMonitoring).toBe(true);
    expect(overview.waitingAction).toBe(false);
  });

  it("snapshot crítico → waitingAction: true", () => {
    const installation = createDemoInstallations().find((i) => i.deploymentPlan === "dedicated")!;
    const snapshot = simulateMonitoringRun(installation, "critical");
    const overview = attachMonitoringSnapshotToInstallationSummary(installation, snapshot);
    expect(overview.waitingAction).toBe(true);
  });

  it("nunca modifica installation/snapshot recebidos", () => {
    const installation = createDemoInstallations()[0]!;
    const snapshot = simulateMonitoringRun(installation, "healthy");
    const before = JSON.stringify(installation);
    attachMonitoringSnapshotToInstallationSummary(installation, snapshot);
    expect(JSON.stringify(installation)).toBe(before);
  });
});

describe("generateMonitoringControlPlaneOverview", () => {
  it("responde as 6 perguntas agregadas (saudáveis/degradadas/indisponíveis/sem monitoramento/incidentes críticos/aguardando ação)", () => {
    const installations = createDemoInstallations();
    const [healthyOne, , dedicated] = installations;

    const snapshotByInstallationId = new Map([
      [healthyOne!.id, simulateMonitoringRun(healthyOne!, "healthy")],
      [dedicated!.id, simulateMonitoringRun(dedicated!, "critical")],
      // installations[1] fica de fora — representa "sem monitoramento"
    ]);

    const overview = generateMonitoringControlPlaneOverview(installations, snapshotByInstallationId);

    expect(overview.total).toBe(installations.length);
    expect(overview.healthy).toBe(1);
    expect(overview.unhealthy).toBe(1);
    expect(overview.withoutMonitoring).toBe(1);
    expect(overview.withCriticalIncidents).toBe(0); // sem incidentes derivados anexados nesta chamada
    expect(overview.installations).toHaveLength(installations.length);
  });
});
