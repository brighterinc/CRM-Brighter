/**
 * Repositório abstrato do Monitoring Engine — Foundation v1.
 *
 * `MonitoringRepository` é a interface; `InMemoryMonitoringRepository` é a
 * única implementação desta etapa, e é DEMONSTRAÇÃO/TESTE, não produção:
 * sem tabela, sem migration, sem Supabase real (mesma doutrina de
 * `InMemoryInstallationRepository`/`InMemoryTenantRepository`). Cada
 * instância começa vazia — nunca use como singleton global mutável da
 * aplicação. Persistência real fica pra uma futura Control Plane com
 * persistência (ver ROADMAP.md).
 */
import { createDemoInstallations } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";

import { simulateMonitoringRun } from "./evaluator";
import { validateMonitoringSnapshotInput } from "./validation";
import type { MonitoringIncident, MonitoringSnapshot, MonitoringValidationError } from "./types";

export class MonitoringSnapshotValidationFailedError extends Error {
  constructor(public readonly errors: MonitoringValidationError[]) {
    super(`monitoring_snapshot_validation_failed: ${errors.map((e) => `${e.field} — ${e.message}`).join("; ")}`);
    this.name = "MonitoringSnapshotValidationFailedError";
  }
}

export class MonitoringIncidentNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`monitoring_incident_not_found: ${id}`);
    this.name = "MonitoringIncidentNotFoundError";
  }
}

export interface MonitoringRepository {
  saveSnapshot(snapshot: MonitoringSnapshot): Promise<MonitoringSnapshot>;
  listSnapshots(installationId?: string): Promise<MonitoringSnapshot[]>;
  findLatestByInstallation(installationId: string): Promise<MonitoringSnapshot | null>;
  listIncidents(installationId?: string): Promise<MonitoringIncident[]>;
  findIncident(id: string): Promise<MonitoringIncident | null>;
  saveIncident(incident: MonitoringIncident): Promise<MonitoringIncident>;
  updateIncident(id: string, patch: Partial<MonitoringIncident>): Promise<MonitoringIncident>;
}

export class InMemoryMonitoringRepository implements MonitoringRepository {
  private readonly snapshots = new Map<string, MonitoringSnapshot>();
  private readonly incidents = new Map<string, MonitoringIncident>();

  constructor(seed: { snapshots?: MonitoringSnapshot[]; incidents?: MonitoringIncident[] } = {}) {
    for (const snapshot of seed.snapshots ?? []) this.snapshots.set(snapshot.id, snapshot);
    for (const incident of seed.incidents ?? []) this.incidents.set(incident.id, incident);
  }

  async saveSnapshot(snapshot: MonitoringSnapshot): Promise<MonitoringSnapshot> {
    const errors = validateMonitoringSnapshotInput(snapshot);
    if (errors.length > 0) throw new MonitoringSnapshotValidationFailedError(errors);
    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  async listSnapshots(installationId?: string): Promise<MonitoringSnapshot[]> {
    const all = Array.from(this.snapshots.values());
    return installationId ? all.filter((s) => s.installationId === installationId) : all;
  }

  async findLatestByInstallation(installationId: string): Promise<MonitoringSnapshot | null> {
    const all = await this.listSnapshots(installationId);
    if (all.length === 0) return null;
    return all.reduce((latest, current) => (current.createdAt > latest.createdAt ? current : latest));
  }

  async listIncidents(installationId?: string): Promise<MonitoringIncident[]> {
    const all = Array.from(this.incidents.values());
    return installationId ? all.filter((i) => i.installationId === installationId) : all;
  }

  async findIncident(id: string): Promise<MonitoringIncident | null> {
    return this.incidents.get(id) ?? null;
  }

  async saveIncident(incident: MonitoringIncident): Promise<MonitoringIncident> {
    this.incidents.set(incident.id, incident);
    return incident;
  }

  async updateIncident(id: string, patch: Partial<MonitoringIncident>): Promise<MonitoringIncident> {
    const existing = this.incidents.get(id);
    if (!existing) throw new MonitoringIncidentNotFoundError(id);
    const merged: MonitoringIncident = { ...existing, ...patch, id: existing.id };
    this.incidents.set(id, merged);
    return merged;
  }
}

/**
 * Catálogo local/in-memory de DEMONSTRAÇÃO — 1 snapshot saudável (simulado)
 * por instalação de `createDemoInstallations()` (`lib/control-plane/`).
 * Usado por testes, CLI e a tela admin. Nunca dado real, nunca persistido.
 */
export function createDemoMonitoringSnapshots(installations: Installation[] = createDemoInstallations()): MonitoringSnapshot[] {
  return installations.map((installation) => simulateMonitoringRun(installation, "healthy"));
}
