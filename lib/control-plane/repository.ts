/**
 * Repositório abstrato da Control Plane — Foundation v1.
 *
 * `InstallationRepository` é a interface; `InMemoryInstallationRepository`
 * é a única implementação desta etapa, e é DEMONSTRAÇÃO/TESTE, não
 * produção: sem tabela, sem migration, sem Supabase real (mesma doutrina de
 * `InMemoryTenantRepository` em `lib/tenants/repository.ts`). Cada instância
 * começa vazia — nunca use como singleton global mutável da aplicação.
 *
 * `create()`/`update()` NUNCA aceitam `branding`/`modules`/`deployment`/
 * `provisioning`/`deploymentPlan` como input solto — esses campos são
 * SEMPRE derivados do `tenant` embutido (`attachDeploymentManifest` já deve
 * ter rodado nele, então `tenant.manifest` existe). Isso é o que garante,
 * por construção, que a `Installation` nunca guarda uma cópia divergente —
 * `validateInstallationInput` (`./validation.ts`) é só o cinto de segurança.
 */
// Import direto dos submódulos (nunca o barrel `@/lib/tenants`) — o barrel
// reexporta `current-installation.ts`, que lê `process.env` via `lib/env.ts`
// e lança se as env vars do Supabase não estiverem configuradas (ex.: CLI
// sem `.env`). Mesmo cuidado que `lib/provisioning/` já toma.
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import { createDemoTenants } from "@/lib/tenants/repository";
import type { Tenant } from "@/lib/tenants/types";
import { generateDeploymentManifest } from "@/lib/deployment";
import { generateProvisioningPlan, generateProvisioningSummary } from "@/lib/provisioning";

import { validateInstallationInput } from "./validation";
import type { CommercialStatus, Installation, InstallationStatus, InstallationValidationError, TechnicalStatus } from "./types";

export class InstallationNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`installation_not_found: ${id}`);
    this.name = "InstallationNotFoundError";
  }
}

export class InstallationValidationFailedError extends Error {
  constructor(public readonly errors: InstallationValidationError[]) {
    super(
      `installation_validation_failed: ${errors.map((e) => `${e.field} — ${e.message}`).join("; ")}`,
    );
    this.name = "InstallationValidationFailedError";
  }
}

export class TenantMissingManifestError extends Error {
  constructor(public readonly tenantId: string) {
    super(`tenant_missing_manifest: ${tenantId} — anexe o manifesto (attachDeploymentManifest) antes de registrar`);
    this.name = "TenantMissingManifestError";
  }
}

export type InstallationCreateInput = {
  slug: string;
  company: string;
  status: InstallationStatus;
  commercial: CommercialStatus;
  technical: TechnicalStatus;
  /** Precisa já ter `tenant.manifest` anexado (via `attachDeploymentManifest`). */
  tenant: Tenant;
};

/** Deriva os campos que a `Installation` nunca guarda de forma independente do `tenant`. */
function deriveInstallationFromTenant(
  tenant: Tenant,
): Pick<Installation, "deploymentPlan" | "branding" | "modules" | "deployment" | "provisioning"> {
  if (!tenant.manifest) throw new TenantMissingManifestError(tenant.id);

  const plan = generateProvisioningPlan({ tenant, manifest: tenant.manifest });
  const provisioning = generateProvisioningSummary(plan, tenant.manifest);

  return {
    deploymentPlan: tenant.plan,
    branding: tenant.branding,
    modules: tenant.enabledModules,
    deployment: tenant.manifest,
    provisioning,
  };
}

export interface InstallationRepository {
  list(): Promise<Installation[]>;
  findInstallation(idOrSlug: string): Promise<Installation | null>;
  createInstallation(input: InstallationCreateInput): Promise<Installation>;
  updateInstallation(id: string, patch: Partial<InstallationCreateInput>): Promise<Installation>;
  archiveInstallation(id: string): Promise<Installation>;
  filterInstallations(predicate: (installation: Installation) => boolean): Promise<Installation[]>;
  countByStatus(): Promise<Record<InstallationStatus, number>>;
}

export class InMemoryInstallationRepository implements InstallationRepository {
  private readonly installations = new Map<string, Installation>();

  constructor(seed: Installation[] = []) {
    for (const installation of seed) this.installations.set(installation.id, installation);
  }

  async list(): Promise<Installation[]> {
    return Array.from(this.installations.values());
  }

  async findInstallation(idOrSlug: string): Promise<Installation | null> {
    const byId = this.installations.get(idOrSlug);
    if (byId) return byId;
    return Array.from(this.installations.values()).find((i) => i.slug === idOrSlug) ?? null;
  }

  async createInstallation(input: InstallationCreateInput): Promise<Installation> {
    const now = new Date().toISOString();
    const derived = deriveInstallationFromTenant(input.tenant);
    const candidate: Installation = {
      id: crypto.randomUUID(),
      slug: input.slug,
      company: input.company,
      status: input.status,
      commercial: input.commercial,
      technical: input.technical,
      tenant: input.tenant,
      ...derived,
      createdAt: now,
      updatedAt: now,
    };

    const errors = validateInstallationInput(candidate);
    if (errors.length > 0) throw new InstallationValidationFailedError(errors);

    this.installations.set(candidate.id, candidate);
    return candidate;
  }

  async updateInstallation(id: string, patch: Partial<InstallationCreateInput>): Promise<Installation> {
    const existing = this.installations.get(id);
    if (!existing) throw new InstallationNotFoundError(id);

    const tenant = patch.tenant ?? existing.tenant;
    const derived = deriveInstallationFromTenant(tenant);

    const merged: Installation = {
      ...existing,
      slug: patch.slug ?? existing.slug,
      company: patch.company ?? existing.company,
      status: patch.status ?? existing.status,
      commercial: patch.commercial ?? existing.commercial,
      technical: patch.technical ?? existing.technical,
      tenant,
      ...derived,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const errors = validateInstallationInput(merged);
    if (errors.length > 0) throw new InstallationValidationFailedError(errors);

    this.installations.set(id, merged);
    return merged;
  }

  async archiveInstallation(id: string): Promise<Installation> {
    return this.updateInstallation(id, { status: "archived" });
  }

  async filterInstallations(predicate: (installation: Installation) => boolean): Promise<Installation[]> {
    return (await this.list()).filter(predicate);
  }

  async countByStatus(): Promise<Record<InstallationStatus, number>> {
    const all = await this.list();
    const counts: Record<string, number> = {};
    for (const installation of all) {
      counts[installation.status] = (counts[installation.status] ?? 0) + 1;
    }
    return counts as Record<InstallationStatus, number>;
  }
}

/**
 * Catálogo local/in-memory de DEMONSTRAÇÃO — 1 instalação por plano (Lite/
 * Pro/Dedicated), montada a partir de `createDemoTenants()`
 * (`lib/tenants/repository.ts`) com manifesto gerado e anexado. Usado por
 * testes, CLI e a tela admin. Nunca dado real, nunca persistido.
 */
export function createDemoInstallations(): Installation[] {
  const tenants = createDemoTenants();
  const statuses: Array<{ status: InstallationStatus; commercial: CommercialStatus; technical: TechnicalStatus }> = [
    { status: "waiting_dns", commercial: "implementation", technical: "deploying" },
    { status: "active", commercial: "production", technical: "running" },
    { status: "provisioning", commercial: "contract", technical: "validated" },
  ];

  return tenants.map((tenant, index) => {
    const manifest = generateDeploymentManifest({
      clientName: tenant.clientName,
      clientSlug: tenant.clientSlug,
      domain: tenant.domain,
      plan: tenant.plan,
      requestedModules: tenant.requestedModules,
      branding: tenant.branding,
    });
    const attached = attachDeploymentManifest(tenant, manifest);
    if (!attached.ok) {
      throw new Error(`fixture de demonstração inválida: ${JSON.stringify(attached.errors)}`);
    }
    const tenantWithManifest = attached.tenant;
    const derived = deriveInstallationFromTenant(tenantWithManifest);
    const meta = statuses[index % statuses.length]!;
    const now = new Date().toISOString();

    return {
      id: crypto.randomUUID(),
      slug: tenant.clientSlug,
      company: tenant.clientName,
      status: meta.status,
      commercial: meta.commercial,
      technical: meta.technical,
      tenant: tenantWithManifest,
      ...derived,
      createdAt: now,
      updatedAt: now,
    };
  });
}
