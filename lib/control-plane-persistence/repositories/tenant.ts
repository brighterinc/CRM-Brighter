/**
 * `DatabaseTenantRepository` — implementação real (Supabase, admin client) de
 * `TenantRepository` (`lib/tenants/repository.ts`), ao lado da
 * `InMemoryTenantRepository` já existente, nunca a substituindo em silêncio
 * (ver `factory.ts`). Sem `organization_id` pra filtrar — `control_plane_tenants`
 * é tabela de PLATAFORMA, não de tenant da CRM; RLS restringe a
 * `fn_is_platform_admin()`. Mesmo cuidado de `lib/lgpd/repository.ts`: quem
 * CHAMA este repository é responsável por já ter confirmado platform-admin.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { TenantNotFoundError, TenantValidationFailedError, type TenantCreateInput, type TenantRepository } from "@/lib/tenants/repository";
import type { Tenant } from "@/lib/tenants/types";
import { validateTenantInput } from "@/lib/tenants/validation";

import { tenantDomainToInsertRow, tenantDomainToUpdateRow, tenantRowToDomain, type ControlPlaneTenantRow } from "../mappers/tenant";
import { assertSafePersistencePayload } from "../safe-persistence";

const TABLE = "control_plane_tenants";

export class DatabaseTenantRepository implements TenantRepository {
  async list(): Promise<Tenant[]> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(TABLE).select("*").order("created_at", { ascending: false });
    if (error) throw new Error(`[control-plane-persistence] TenantRepository.list failed: ${error.message}`);
    return (data as ControlPlaneTenantRow[]).map(tenantRowToDomain);
  }

  async findById(id: string): Promise<Tenant | null> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`[control-plane-persistence] TenantRepository.findById failed: ${error.message}`);
    return data ? tenantRowToDomain(data as ControlPlaneTenantRow) : null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(TABLE).select("*").eq("client_slug", slug).maybeSingle();
    if (error) throw new Error(`[control-plane-persistence] TenantRepository.findBySlug failed: ${error.message}`);
    return data ? tenantRowToDomain(data as ControlPlaneTenantRow) : null;
  }

  async create(input: TenantCreateInput): Promise<Tenant> {
    const now = new Date().toISOString();
    const errors = validateTenantInput({ ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now });
    if (errors.length > 0) throw new TenantValidationFailedError(errors);
    assertSafePersistencePayload(input, "DatabaseTenantRepository.create");

    const admin = createAdminClient();
    const { data, error } = await admin.from(TABLE).insert(tenantDomainToInsertRow(input)).select("*").single();
    if (error) throw new Error(`[control-plane-persistence] TenantRepository.create failed: ${error.message}`);
    return tenantRowToDomain(data as ControlPlaneTenantRow);
  }

  async update(id: string, patch: Partial<Tenant>): Promise<Tenant> {
    const existing = await this.findById(id);
    if (!existing) throw new TenantNotFoundError(id);

    const merged: Tenant = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    const errors = validateTenantInput(merged);
    if (errors.length > 0) throw new TenantValidationFailedError(errors);
    assertSafePersistencePayload(patch, "DatabaseTenantRepository.update");

    const admin = createAdminClient();
    const { data, error } = await admin.from(TABLE).update(tenantDomainToUpdateRow(patch)).eq("id", id).select("*").single();
    if (error) throw new Error(`[control-plane-persistence] TenantRepository.update failed: ${error.message}`);
    return tenantRowToDomain(data as ControlPlaneTenantRow);
  }
}
