/**
 * `CredentialLeaseRepository` — só in-memory nesta fase (nenhuma tabela
 * `control_plane_secret_leases` existe ainda, e esta etapa NÃO aplica
 * migration). Mesma doutrina de `InMemoryCredentialsVault`: `Map` privado
 * por instância, nunca singleton global, nunca persiste em disco/rede.
 */
import { randomUUID } from "node:crypto";

import { CredentialLeaseNotFoundError } from "./errors";
import type { CredentialLease } from "./types";

export type CreateCredentialLeaseInput = Omit<CredentialLease, "id" | "status" | "createdAt">;

export interface CredentialLeaseRepository {
  create(input: CreateCredentialLeaseInput): Promise<CredentialLease>;
  find(id: string): Promise<CredentialLease | null>;
  update(id: string, patch: Partial<CredentialLease>): Promise<CredentialLease>;
  listByInstallation(installationId: string): Promise<CredentialLease[]>;
}

export class InMemoryCredentialLeaseRepository implements CredentialLeaseRepository {
  private readonly leases = new Map<string, CredentialLease>();

  async create(input: CreateCredentialLeaseInput): Promise<CredentialLease> {
    const lease: CredentialLease = { ...input, id: randomUUID(), status: "created", createdAt: new Date().toISOString() };
    this.leases.set(lease.id, lease);
    return lease;
  }

  async find(id: string): Promise<CredentialLease | null> {
    return this.leases.get(id) ?? null;
  }

  async update(id: string, patch: Partial<CredentialLease>): Promise<CredentialLease> {
    const existing = this.leases.get(id);
    if (!existing) throw new CredentialLeaseNotFoundError(id);
    const updated: CredentialLease = { ...existing, ...patch };
    this.leases.set(id, updated);
    return updated;
  }

  async listByInstallation(installationId: string): Promise<CredentialLease[]> {
    return Array.from(this.leases.values())
      .filter((lease) => lease.installationId === installationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
