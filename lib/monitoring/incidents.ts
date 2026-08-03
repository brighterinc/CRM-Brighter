/**
 * Incidentes do Monitoring Engine — Foundation v1.
 *
 * Tudo em memória, tudo puro. Nenhuma notificação, nenhum webhook, nenhum
 * ticket externo é disparado por nada aqui — a persistência/entrega fica
 * pro `MonitoringRepository` (`repository.ts`) e pra uma fase futura.
 */
import { getMonitoringCheckDefinition } from "./catalog";
import { FAILURE_CHECK_STATUSES, OPEN_INCIDENT_STATUSES } from "./status";
import type { MonitoringIncident, MonitoringSnapshot } from "./types";

/**
 * Deriva incidentes NOVOS a partir dos checks em falha do snapshot — nunca
 * duplica um incidente já aberto/reconhecido/em investigação pro mesmo
 * `sourceCheckId` (comparação por `installationId` + `sourceCheckId`).
 * Pura: não muta `existingOpenIncidents`, retorna só os incidentes a somar.
 */
export function deriveIncidentsFromSnapshot(
  snapshot: MonitoringSnapshot,
  existingOpenIncidents: MonitoringIncident[] = [],
): MonitoringIncident[] {
  const now = new Date().toISOString();
  const hasOpenIncidentFor = (checkId: string) =>
    existingOpenIncidents.some(
      (incident) =>
        incident.installationId === snapshot.installationId &&
        incident.sourceCheckId === checkId &&
        OPEN_INCIDENT_STATUSES.includes(incident.status),
    );

  const created: MonitoringIncident[] = [];

  for (const check of snapshot.checks) {
    if (!FAILURE_CHECK_STATUSES.includes(check.status)) continue;
    if (hasOpenIncidentFor(check.checkId)) continue;

    const def = getMonitoringCheckDefinition(check.checkId);
    if (!def) continue; // check fora do catálogo — nunca deveria acontecer, já validado antes

    created.push({
      id: crypto.randomUUID(),
      installationId: snapshot.installationId,
      tenantId: snapshot.tenantId,
      title: `${def.name} — ${check.status === "unhealthy" ? "indisponível" : "degradado"}`,
      description: check.message,
      severity: def.severityWhenFailed,
      status: "open",
      sourceCheckId: check.checkId,
      openedAt: now,
      nextAction: check.nextRecommendedAction,
      metadata: check.metadata,
    });
  }

  return created;
}

export function acknowledgeIncident(incident: MonitoringIncident, assignedTo?: string): MonitoringIncident {
  return {
    ...incident,
    status: "acknowledged",
    acknowledgedAt: new Date().toISOString(),
    assignedTo: assignedTo ?? incident.assignedTo,
  };
}

export function resolveIncident(incident: MonitoringIncident): MonitoringIncident {
  return {
    ...incident,
    status: "resolved",
    resolvedAt: new Date().toISOString(),
  };
}

export function reopenIncident(incident: MonitoringIncident): MonitoringIncident {
  return {
    ...incident,
    status: "open",
    acknowledgedAt: undefined,
    resolvedAt: undefined,
  };
}
