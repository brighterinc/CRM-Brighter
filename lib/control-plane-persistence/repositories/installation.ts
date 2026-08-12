/**
 * `DatabaseInstallationRepository` — implementação real de `InstallationRepository`
 * (`lib/control-plane/repository.ts`), ao lado da `InMemoryInstallationRepository`.
 * `deployment`/`branding`/`modules`/`deploymentPlan`/`provisioning` NUNCA são
 * lidos de coluna — sempre recalculados a partir do `tenant` hidratado via
 * `deriveInstallationFromTenant` (mesma função que a implementação in-memory
 * usa), exatamente como a linha da tabela foi desenhada (ver migration
 * `0098_control_plane_persistence`).
 */
import {
  deriveInstallationFromTenant,
  InstallationNotFoundError,
  InstallationValidationFailedError,
  TenantMissingManifestError,
  type InstallationCreateInput,
  type InstallationRepository,
} from "@/lib/control-plane/repository";
import type { Installation, InstallationStatus } from "@/lib/control-plane/types";
import { validateInstallationInput } from "@/lib/control-plane/validation";
import { generateDeploymentManifest } from "@/lib/deployment";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TenantRepository } from "@/lib/tenants/repository";
import type { Tenant } from "@/lib/tenants/types";
import { attachDeploymentManifest } from "@/lib/tenants/validation";

import { installationDomainToInsertRow, installationRowToDomain, type ControlPlaneInstallationRow } from "../mappers/installation";
import { DatabaseTenantRepository } from "./tenant";

const TABLE = "control_plane_installations";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `control_plane_tenants` NUNCA guarda `.manifest` (é sempre derivado, nunca
 * coluna — ver `mappers/tenant.ts`). Quando o tenant vem hidratado do banco
 * (sem manifesto anexado), regenera na hora com a MESMA função determinística
 * que criou o manifesto originalmente (`generateDeploymentManifest`) — nunca
 * lido de um snapshot que poderia estar desatualizado. Se o tenant já tem
 * `.manifest` (ex.: veio in-memory de `createInstallation`), não mexe.
 */
function ensureTenantManifest(tenant: Tenant): Tenant {
  if (tenant.manifest) return tenant;
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
    throw new Error(`[control-plane-persistence] não foi possível regenerar manifesto do tenant ${tenant.id}: ${JSON.stringify(attached.errors)}`);
  }
  return attached.tenant;
}

export class DatabaseInstallationRepository implements InstallationRepository {
  constructor(private readonly tenants: TenantRepository = new DatabaseTenantRepository()) {}

  private async hydrate(row: ControlPlaneInstallationRow, tenantOverride?: Tenant): Promise<Installation> {
    const rawTenant = tenantOverride ?? (await this.tenants.findById(row.tenant_id));
    if (!rawTenant) throw new Error(`[control-plane-persistence] installation ${row.id} referencia tenant ${row.tenant_id} inexistente`);
    return installationRowToDomain(row, ensureTenantManifest(rawTenant));
  }

  async list(): Promise<Installation[]> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(TABLE).select("*").order("created_at", { ascending: false });
    if (error) throw new Error(`[control-plane-persistence] InstallationRepository.list failed: ${error.message}`);
    return Promise.all((data as ControlPlaneInstallationRow[]).map((row) => this.hydrate(row)));
  }

  async findInstallation(idOrSlug: string): Promise<Installation | null> {
    const admin = createAdminClient();
    const query = UUID_PATTERN.test(idOrSlug) ? admin.from(TABLE).select("*").eq("id", idOrSlug) : admin.from(TABLE).select("*").eq("slug", idOrSlug);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`[control-plane-persistence] InstallationRepository.findInstallation failed: ${error.message}`);
    return data ? this.hydrate(data as ControlPlaneInstallationRow) : null;
  }

  async createInstallation(input: InstallationCreateInput): Promise<Installation> {
    if (!input.tenant.manifest) throw new TenantMissingManifestError(input.tenant.id);
    const derived = deriveInstallationFromTenant(input.tenant);
    const now = new Date().toISOString();
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

    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .insert(
        installationDomainToInsertRow({
          tenantId: input.tenant.id,
          slug: input.slug,
          company: input.company,
          status: input.status,
          commercial: input.commercial,
          technical: input.technical,
        }),
      )
      .select("*")
      .single();
    if (error) throw new Error(`[control-plane-persistence] InstallationRepository.createInstallation failed: ${error.message}`);
    return installationRowToDomain(data as ControlPlaneInstallationRow, input.tenant);
  }

  async updateInstallation(id: string, patch: Partial<InstallationCreateInput>): Promise<Installation> {
    const admin = createAdminClient();
    const { data: existingRow, error: findError } = await admin.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (findError) throw new Error(`[control-plane-persistence] InstallationRepository.updateInstallation failed: ${findError.message}`);
    if (!existingRow) throw new InstallationNotFoundError(id);
    const row = existingRow as ControlPlaneInstallationRow;

    const rawTenant = patch.tenant ?? (await this.tenants.findById(row.tenant_id));
    if (!rawTenant) throw new Error(`[control-plane-persistence] installation ${id} referencia tenant inexistente`);
    const tenant = ensureTenantManifest(rawTenant);

    const derived = deriveInstallationFromTenant(tenant);
    const merged: Installation = {
      id,
      slug: patch.slug ?? row.slug,
      company: patch.company ?? row.company,
      status: patch.status ?? (row.status as InstallationStatus),
      commercial: patch.commercial ?? (row.commercial as Installation["commercial"]),
      technical: patch.technical ?? (row.technical as Installation["technical"]),
      tenant,
      ...derived,
      createdAt: row.created_at,
      updatedAt: new Date().toISOString(),
    };
    const errors = validateInstallationInput(merged);
    if (errors.length > 0) throw new InstallationValidationFailedError(errors);

    const { data, error } = await admin
      .from(TABLE)
      .update({
        tenant_id: tenant.id,
        slug: merged.slug,
        company: merged.company,
        status: merged.status,
        commercial: merged.commercial,
        technical: merged.technical,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`[control-plane-persistence] InstallationRepository.updateInstallation failed: ${error.message}`);
    return installationRowToDomain(data as ControlPlaneInstallationRow, tenant);
  }

  async archiveInstallation(id: string): Promise<Installation> {
    return this.updateInstallation(id, { status: "archived" });
  }

  async filterInstallations(predicate: (installation: Installation) => boolean): Promise<Installation[]> {
    return (await this.list()).filter(predicate);
  }

  async countByStatus(): Promise<Record<InstallationStatus, number>> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(TABLE).select("status");
    if (error) throw new Error(`[control-plane-persistence] InstallationRepository.countByStatus failed: ${error.message}`);
    const counts: Record<string, number> = {};
    for (const row of data as { status: string }[]) counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts as Record<InstallationStatus, number>;
  }
}
