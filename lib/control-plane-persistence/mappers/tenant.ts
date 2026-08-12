/**
 * Mapper `control_plane_tenants` <-> `Tenant` (`lib/tenants/types.ts`).
 *
 * `Tenant.manifest` NUNCA vem desta linha — o manifesto persistido vive em
 * `control_plane_deployments` (histórico versionado, ver
 * `mappers/deployment.ts`), nunca duplicado como coluna aqui. Quem precisa
 * do `Tenant` "vivo" com manifesto anexado chama
 * `attachDeploymentManifest`/`generateDeploymentManifest` por cima do que
 * este mapper devolve — mesma sequência que `createDemoInstallations()` já
 * usa hoje in-memory.
 */
// Import direto dos submódulos (nunca o barrel `@/lib/tenants` — reexporta
// `current-installation.ts`, que lê `process.env` via `lib/env.ts`).
import type { TenantCreateInput } from "@/lib/tenants/repository";
import type { Tenant } from "@/lib/tenants/types";

export type ControlPlaneTenantRow = {
  id: string;
  client_slug: string;
  client_name: string;
  legal_name: string | null;
  domain: string;
  plan: string;
  requested_modules: string[];
  enabled_modules: string[];
  branding: Record<string, unknown>;
  commercial_status: string;
  technical_status: string;
  primary_contact: Record<string, unknown> | null;
  account_manager: Record<string, unknown> | null;
  infrastructure: Record<string, unknown> | null;
  supabase_ref: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function tenantRowToDomain(row: ControlPlaneTenantRow): Tenant {
  return {
    id: row.id,
    clientName: row.client_name,
    clientSlug: row.client_slug,
    legalName: row.legal_name ?? undefined,
    domain: row.domain,
    plan: row.plan as Tenant["plan"],
    requestedModules: row.requested_modules,
    enabledModules: row.enabled_modules,
    branding: row.branding as Tenant["branding"],
    commercialStatus: row.commercial_status as Tenant["commercialStatus"],
    technicalStatus: row.technical_status as Tenant["technicalStatus"],
    primaryContact: (row.primary_contact as Tenant["primaryContact"]) ?? undefined,
    accountManager: (row.account_manager as Tenant["accountManager"]) ?? undefined,
    infrastructure: (row.infrastructure as Tenant["infrastructure"]) ?? undefined,
    supabase: (row.supabase_ref as Tenant["supabase"]) ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ControlPlaneTenantInsertRow = Omit<ControlPlaneTenantRow, "id" | "created_at" | "updated_at">;

/** `input` já não carrega `manifest` (`TenantCreateInput` = `Tenant` sem id/timestamps, mas o campo é sempre descartado aqui — ver cabeçalho). */
export function tenantDomainToInsertRow(input: TenantCreateInput): ControlPlaneTenantInsertRow {
  return {
    client_slug: input.clientSlug,
    client_name: input.clientName,
    legal_name: input.legalName ?? null,
    domain: input.domain,
    plan: input.plan,
    requested_modules: input.requestedModules,
    enabled_modules: input.enabledModules,
    branding: input.branding,
    commercial_status: input.commercialStatus,
    technical_status: input.technicalStatus,
    primary_contact: input.primaryContact ?? null,
    account_manager: input.accountManager ?? null,
    infrastructure: input.infrastructure ?? null,
    supabase_ref: input.supabase ?? null,
    notes: input.notes ?? null,
  };
}

export function tenantDomainToUpdateRow(patch: Partial<Tenant>): Partial<ControlPlaneTenantInsertRow> {
  const row: Partial<ControlPlaneTenantInsertRow> = {};
  if (patch.clientSlug !== undefined) row.client_slug = patch.clientSlug;
  if (patch.clientName !== undefined) row.client_name = patch.clientName;
  if (patch.legalName !== undefined) row.legal_name = patch.legalName ?? null;
  if (patch.domain !== undefined) row.domain = patch.domain;
  if (patch.plan !== undefined) row.plan = patch.plan;
  if (patch.requestedModules !== undefined) row.requested_modules = patch.requestedModules;
  if (patch.enabledModules !== undefined) row.enabled_modules = patch.enabledModules;
  if (patch.branding !== undefined) row.branding = patch.branding;
  if (patch.commercialStatus !== undefined) row.commercial_status = patch.commercialStatus;
  if (patch.technicalStatus !== undefined) row.technical_status = patch.technicalStatus;
  if (patch.primaryContact !== undefined) row.primary_contact = patch.primaryContact ?? null;
  if (patch.accountManager !== undefined) row.account_manager = patch.accountManager ?? null;
  if (patch.infrastructure !== undefined) row.infrastructure = patch.infrastructure ?? null;
  if (patch.supabase !== undefined) row.supabase_ref = patch.supabase ?? null;
  if (patch.notes !== undefined) row.notes = patch.notes ?? null;
  return row;
}
