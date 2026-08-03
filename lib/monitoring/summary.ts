/**
 * Resumo operacional do Monitoring Engine — Foundation v1.
 *
 * `attachMonitoringSnapshotToInstallationSummary`/
 * `generateMonitoringControlPlaneOverview` são a integração com a Control
 * Plane pedida nesta Foundation — NUNCA alteram `Installation`/
 * `ControlPlaneSummary` (`lib/control-plane/`); produzem um view model
 * próprio que a tela da Control Plane PODERIA consumir no futuro (tela
 * nova fica isolada por enquanto — ver `docs/monitoring/monitoring-engine.md`).
 */
import { getMonitoringCheckDefinition } from "./catalog";
import { OPEN_INCIDENT_STATUSES } from "./status";
import type { Installation } from "@/lib/control-plane/types";
import type { DeploymentPlan, MonitoringCategory, MonitoringCheckStatus, MonitoringSnapshot } from "./types";

export type MonitoringOperationalSummary = {
  installationId: string;
  slug: string;
  company: string;
  plan: DeploymentPlan;
  overallHealth: MonitoringCheckStatus;
  score: number;
  totalChecks: number;
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
  unknownCount: number;
  criticalIncidents: number;
  openIncidents: number;
  lateChecks: number;
  lateCheckIds: string[];
  blockers: string[];
  warnings: string[];
  nextSteps: string[];
  affectedModules: string[];
  affectedCategories: MonitoringCategory[];
  generatedAt: string;
};

function countOpen(snapshot: MonitoringSnapshot, severity?: "critical"): number {
  return snapshot.incidents.filter(
    (i) => OPEN_INCIDENT_STATUSES.includes(i.status) && (!severity || i.severity === severity),
  ).length;
}

/** Resumo (JSON) de UMA instalação a partir de um `MonitoringSnapshot` já avaliado. */
export function generateMonitoringSummary(installation: Installation, snapshot: MonitoringSnapshot): MonitoringOperationalSummary {
  let healthyCount = 0;
  let degradedCount = 0;
  let unhealthyCount = 0;
  let unknownCount = 0;
  const affectedCategories = new Set<MonitoringCategory>();
  const affectedModules = new Set<string>();

  for (const check of snapshot.checks) {
    if (check.status === "healthy") healthyCount += 1;
    else if (check.status === "degraded") degradedCount += 1;
    else if (check.status === "unhealthy") unhealthyCount += 1;
    else unknownCount += 1;

    if (check.status === "degraded" || check.status === "unhealthy") {
      const def = getMonitoringCheckDefinition(check.checkId);
      if (def) {
        affectedCategories.add(def.category);
        for (const moduleId of def.requiredModules ?? []) affectedModules.add(moduleId);
      }
    }
  }

  const nextSteps = [...snapshot.blockers, ...snapshot.warnings];
  if (snapshot.nextRecommendedAction && !nextSteps.includes(snapshot.nextRecommendedAction)) {
    nextSteps.unshift(snapshot.nextRecommendedAction);
  }

  return {
    installationId: installation.id,
    slug: installation.slug,
    company: installation.company,
    plan: installation.deploymentPlan,
    overallHealth: snapshot.overallHealth,
    score: snapshot.score,
    totalChecks: snapshot.checks.length,
    healthyCount,
    degradedCount,
    unhealthyCount,
    unknownCount,
    criticalIncidents: countOpen(snapshot, "critical"),
    openIncidents: countOpen(snapshot),
    lateChecks: snapshot.lateCheckIds.length,
    lateCheckIds: snapshot.lateCheckIds,
    blockers: snapshot.blockers,
    warnings: snapshot.warnings,
    nextSteps,
    affectedModules: Array.from(affectedModules),
    affectedCategories: Array.from(affectedCategories),
    generatedAt: new Date().toISOString(),
  };
}

/** Renderiza `generateMonitoringSummary` como Markdown — usado pela CLI e (opcionalmente) pela tela admin. */
export function renderMonitoringSummaryMarkdown(summary: MonitoringOperationalSummary): string {
  const lines: string[] = [
    `# Monitoramento — ${summary.company} (${summary.slug})`,
    "",
    `- Plano: ${summary.plan}`,
    `- Saúde geral: ${summary.overallHealth}`,
    `- Score: ${summary.score}/100`,
    `- Checks: ${summary.totalChecks} (saudáveis: ${summary.healthyCount}, degradados: ${summary.degradedCount}, indisponíveis: ${summary.unhealthyCount}, desconhecidos: ${summary.unknownCount})`,
    `- Incidentes críticos: ${summary.criticalIncidents}`,
    `- Incidentes em aberto: ${summary.openIncidents}`,
    `- Checks atrasados: ${summary.lateChecks}${summary.lateCheckIds.length > 0 ? ` (${summary.lateCheckIds.join(", ")})` : ""}`,
    "",
    "## Próximos passos",
    ...(summary.nextSteps.length > 0 ? summary.nextSteps.map((s) => `- ${s}`) : ["- Nenhum — instalação saudável."]),
    "",
    "## Módulos afetados",
    ...(summary.affectedModules.length > 0 ? summary.affectedModules.map((m) => `- ${m}`) : ["- Nenhum."]),
    "",
    "## Categorias afetadas",
    ...(summary.affectedCategories.length > 0 ? summary.affectedCategories.map((c) => `- ${c}`) : ["- Nenhuma."]),
  ];
  return lines.join("\n") + "\n";
}

/** View model combinado de UMA instalação — nunca modifica `Installation`/`ControlPlaneSummary`. */
export type InstallationMonitoringOverview = {
  installationId: string;
  slug: string;
  company: string;
  plan: DeploymentPlan;
  hasMonitoring: boolean;
  overallHealth: MonitoringCheckStatus;
  score: number | null;
  criticalIncidents: number;
  openIncidents: number;
  waitingAction: boolean;
};

/**
 * Anexa o último `MonitoringSnapshot` (ou nenhum) ao resumo de UMA
 * instalação — a integração com a Control Plane pedida nesta Foundation.
 * `snapshot === null` representa "sem monitoramento" (nenhuma rodada ainda).
 */
export function attachMonitoringSnapshotToInstallationSummary(
  installation: Installation,
  snapshot: MonitoringSnapshot | null,
): InstallationMonitoringOverview {
  if (!snapshot) {
    return {
      installationId: installation.id,
      slug: installation.slug,
      company: installation.company,
      plan: installation.deploymentPlan,
      hasMonitoring: false,
      overallHealth: "unknown",
      score: null,
      criticalIncidents: 0,
      openIncidents: 0,
      waitingAction: false,
    };
  }

  const criticalIncidents = countOpen(snapshot, "critical");
  const openIncidents = countOpen(snapshot);

  return {
    installationId: installation.id,
    slug: installation.slug,
    company: installation.company,
    plan: installation.deploymentPlan,
    hasMonitoring: true,
    overallHealth: snapshot.overallHealth,
    score: snapshot.score,
    criticalIncidents,
    openIncidents,
    waitingAction: snapshot.blockers.length > 0 || criticalIncidents > 0,
  };
}

export type MonitoringControlPlaneOverview = {
  total: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  withoutMonitoring: number;
  withCriticalIncidents: number;
  waitingAction: number;
  installations: InstallationMonitoringOverview[];
  generatedAt: string;
};

/**
 * Agrega `attachMonitoringSnapshotToInstallationSummary` por TODAS as
 * instalações — responde exatamente as 6 perguntas do §12: saudáveis,
 * degradadas, indisponíveis, sem monitoramento, com incidentes críticos,
 * aguardando ação.
 */
export function generateMonitoringControlPlaneOverview(
  installations: Installation[],
  snapshotByInstallationId: Map<string, MonitoringSnapshot>,
): MonitoringControlPlaneOverview {
  const overviews = installations.map((installation) =>
    attachMonitoringSnapshotToInstallationSummary(installation, snapshotByInstallationId.get(installation.id) ?? null),
  );

  return {
    total: overviews.length,
    healthy: overviews.filter((o) => o.overallHealth === "healthy").length,
    degraded: overviews.filter((o) => o.overallHealth === "degraded").length,
    unhealthy: overviews.filter((o) => o.overallHealth === "unhealthy").length,
    withoutMonitoring: overviews.filter((o) => !o.hasMonitoring).length,
    withCriticalIncidents: overviews.filter((o) => o.criticalIncidents > 0).length,
    waitingAction: overviews.filter((o) => o.waitingAction).length,
    installations: overviews,
    generatedAt: new Date().toISOString(),
  };
}
