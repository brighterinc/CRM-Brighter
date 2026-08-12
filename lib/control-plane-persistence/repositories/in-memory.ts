/**
 * Implementações in-memory das 4 interfaces NOVAS desta fase (sem
 * equivalente anterior pra reusar, ao contrário de tenant/installation, que
 * já tinham `InMemoryTenantRepository`/`InMemoryInstallationRepository`).
 * Mesma doutrina das demais Foundations: demonstração/teste, nunca produção,
 * cada instância começa vazia, nunca singleton global.
 */
import { assertSafePersistencePayload } from "../safe-persistence";
import type { PersistedDeployment, PersistedOperationEvent, PersistedProviderConnection, PersistedProvisioningRun, PersistedProvisioningStep } from "../types";
import type { RecordDeploymentInput, DeploymentRepository } from "./deployment";
import type { RecordOperationEventInput, OperationEventRepository } from "./operation-event";
import type { RecordProviderConnectionInput, ProviderConnectionRepository } from "./provider-connection";
import type { CreateProvisioningRunInput, ProvisioningRunRepository, UpsertProvisioningStepInput } from "./provisioning";

export class InMemoryDeploymentRepository implements DeploymentRepository {
  private readonly deployments = new Map<string, PersistedDeployment>();

  async recordDeployment(input: RecordDeploymentInput): Promise<PersistedDeployment> {
    assertSafePersistencePayload(input.manifestSnapshot, "InMemoryDeploymentRepository.recordDeployment.manifestSnapshot");
    const now = new Date().toISOString();
    const deployment: PersistedDeployment = {
      id: crypto.randomUUID(),
      installationId: input.installationId ?? null,
      tenantId: input.tenantId ?? null,
      target: input.target,
      plan: input.plan,
      manifestFingerprint: input.manifestFingerprint,
      manifestSnapshot: input.manifestSnapshot,
      generatedAt: now,
      createdAt: now,
    };
    this.deployments.set(deployment.id, deployment);
    return deployment;
  }

  async listByInstallation(installationId: string): Promise<PersistedDeployment[]> {
    return Array.from(this.deployments.values())
      .filter((d) => d.installationId === installationId)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  }

  async findLatestByInstallation(installationId: string): Promise<PersistedDeployment | null> {
    const [latest] = await this.listByInstallation(installationId);
    return latest ?? null;
  }
}

export class InMemoryProvisioningRepository implements ProvisioningRunRepository {
  private readonly runs = new Map<string, PersistedProvisioningRun>();
  private readonly steps = new Map<string, PersistedProvisioningStep>();

  private stepKey(runId: string, stepId: string): string {
    return `${runId}::${stepId}`;
  }

  async createRun(input: CreateProvisioningRunInput): Promise<PersistedProvisioningRun> {
    const now = new Date().toISOString();
    const run: PersistedProvisioningRun = {
      id: crypto.randomUUID(),
      installationId: input.installationId,
      tenantId: input.tenantId,
      plan: input.plan,
      target: input.target,
      manifestFingerprint: input.manifestFingerprint,
      status: input.status,
      blockers: input.blockers ?? [],
      warnings: input.warnings ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.id, run);
    return run;
  }

  async findRun(id: string): Promise<PersistedProvisioningRun | null> {
    return this.runs.get(id) ?? null;
  }

  async listRunsByInstallation(installationId: string): Promise<PersistedProvisioningRun[]> {
    return Array.from(this.runs.values())
      .filter((r) => r.installationId === installationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateRunStatus(id: string, status: PersistedProvisioningRun["status"]): Promise<PersistedProvisioningRun> {
    const existing = this.runs.get(id);
    if (!existing) throw new Error(`[control-plane-persistence] provisioning run não encontrado: ${id}`);
    const updated: PersistedProvisioningRun = { ...existing, status, updatedAt: new Date().toISOString() };
    this.runs.set(id, updated);
    return updated;
  }

  async upsertStep(input: UpsertProvisioningStepInput): Promise<PersistedProvisioningStep> {
    const key = this.stepKey(input.runId, input.stepId);
    const existing = this.steps.get(key);
    const now = new Date().toISOString();
    const step: PersistedProvisioningStep = {
      id: existing?.id ?? crypto.randomUUID(),
      runId: input.runId,
      stepId: input.stepId,
      category: input.category,
      status: input.status,
      blockers: input.blockers ?? [],
      warnings: input.warnings ?? [],
      startedAt: input.startedAt ?? existing?.startedAt,
      completedAt: input.completedAt ?? existing?.completedAt,
      attempts: input.attempts ?? existing?.attempts ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.steps.set(key, step);
    return step;
  }

  async listSteps(runId: string): Promise<PersistedProvisioningStep[]> {
    return Array.from(this.steps.values())
      .filter((s) => s.runId === runId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export class InMemoryProviderConnectionRepository implements ProviderConnectionRepository {
  private readonly connections = new Map<string, PersistedProviderConnection>();

  private key(installationId: string, provider: string): string {
    return `${installationId}::${provider}`;
  }

  async recordConnection(input: RecordProviderConnectionInput): Promise<PersistedProviderConnection> {
    assertSafePersistencePayload(input.config, "InMemoryProviderConnectionRepository.recordConnection.config");
    const key = this.key(input.installationId, input.provider);
    const existing = this.connections.get(key);
    const now = new Date().toISOString();
    const connection: PersistedProviderConnection = {
      id: existing?.id ?? crypto.randomUUID(),
      installationId: input.installationId,
      provider: input.provider,
      mode: input.mode,
      status: input.status,
      config: input.config,
      secretReferenceId: input.secretReferenceId ?? existing?.secretReferenceId ?? null,
      connectedAt: input.connectedAt ?? existing?.connectedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.connections.set(key, connection);
    return connection;
  }

  async listByInstallation(installationId: string): Promise<PersistedProviderConnection[]> {
    return Array.from(this.connections.values()).filter((c) => c.installationId === installationId);
  }

  async findConnection(installationId: string, provider: PersistedProviderConnection["provider"]): Promise<PersistedProviderConnection | null> {
    return this.connections.get(this.key(installationId, provider)) ?? null;
  }
}

export class InMemoryOperationEventRepository implements OperationEventRepository {
  private readonly events = new Map<string, PersistedOperationEvent>();

  async recordEvent(input: RecordOperationEventInput): Promise<PersistedOperationEvent> {
    const metadata = input.metadata ?? {};
    assertSafePersistencePayload(metadata, "InMemoryOperationEventRepository.recordEvent.metadata");
    const now = new Date().toISOString();
    const event: PersistedOperationEvent = {
      id: crypto.randomUUID(),
      installationId: input.installationId ?? null,
      tenantId: input.tenantId ?? null,
      provisioningRunId: input.provisioningRunId ?? null,
      eventType: input.eventType,
      severity: input.severity,
      message: input.message,
      metadata,
      actorUserId: input.actorUserId ?? null,
      occurredAt: now,
      createdAt: now,
    };
    this.events.set(event.id, event);
    return event;
  }

  async listByInstallation(installationId: string, limit = 200): Promise<PersistedOperationEvent[]> {
    return Array.from(this.events.values())
      .filter((e) => e.installationId === installationId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit);
  }

  async listByTenant(tenantId: string, limit = 200): Promise<PersistedOperationEvent[]> {
    return Array.from(this.events.values())
      .filter((e) => e.tenantId === tenantId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit);
  }

  async listRecent(limit = 200): Promise<PersistedOperationEvent[]> {
    return Array.from(this.events.values())
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit);
  }
}
