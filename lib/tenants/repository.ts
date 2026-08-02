/**
 * Repositório abstrato do Brighter Tenant Engine — Foundation v1.
 *
 * `TenantRepository` é a interface; `InMemoryTenantRepository` é a única
 * implementação desta etapa, e é DEMONSTRAÇÃO/TESTE, não produção: sem
 * tabela, sem migration, sem Supabase real. Persistência de tenant de
 * verdade é trabalho da futura Control Plane (ver
 * `docs/tenants/tenant-engine.md`). Cada instância começa vazia — nunca use
 * como singleton global mutável da aplicação; instancie por chamador (CLI,
 * teste, tela) que precisar de um catálogo local.
 */
import { validateTenantInput } from "./validation";
import type { Tenant, TenantValidationError } from "./types";

export class TenantNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`tenant_not_found: ${id}`);
    this.name = "TenantNotFoundError";
  }
}

export class TenantValidationFailedError extends Error {
  constructor(public readonly errors: TenantValidationError[]) {
    super(`tenant_validation_failed: ${errors.map((e) => `${e.field} — ${e.message}`).join("; ")}`);
    this.name = "TenantValidationFailedError";
  }
}

export type TenantCreateInput = Omit<Tenant, "id" | "createdAt" | "updatedAt">;

export interface TenantRepository {
  list(): Promise<Tenant[]>;
  findById(id: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  create(input: TenantCreateInput): Promise<Tenant>;
  update(id: string, patch: Partial<Tenant>): Promise<Tenant>;
}

export class InMemoryTenantRepository implements TenantRepository {
  private readonly tenants = new Map<string, Tenant>();

  constructor(seed: Tenant[] = []) {
    for (const tenant of seed) this.tenants.set(tenant.id, tenant);
  }

  async list(): Promise<Tenant[]> {
    return Array.from(this.tenants.values());
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.tenants.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return Array.from(this.tenants.values()).find((t) => t.clientSlug === slug) ?? null;
  }

  async create(input: TenantCreateInput): Promise<Tenant> {
    const now = new Date().toISOString();
    const candidate: Tenant = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    const errors = validateTenantInput(candidate);
    if (errors.length > 0) throw new TenantValidationFailedError(errors);
    this.tenants.set(candidate.id, candidate);
    return candidate;
  }

  async update(id: string, patch: Partial<Tenant>): Promise<Tenant> {
    const existing = this.tenants.get(id);
    if (!existing) throw new TenantNotFoundError(id);
    const merged: Tenant = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const errors = validateTenantInput(merged);
    if (errors.length > 0) throw new TenantValidationFailedError(errors);
    this.tenants.set(id, merged);
    return merged;
  }
}

function baseDemoTenant(overrides: Partial<Tenant> = {}): Tenant {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    clientName: "Empresa Demo",
    clientSlug: "empresa-demo",
    domain: "crm.empresa-demo.com.br",
    plan: "lite",
    requestedModules: ["core.contacts", "core.pipeline"],
    enabledModules: ["core.contacts", "core.pipeline"],
    branding: { appName: "Empresa Demo" },
    commercialStatus: "onboarding",
    technicalStatus: "configuration_pending",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Catálogo local/in-memory de DEMONSTRAÇÃO — 1 tenant por plano (Lite/Pro/
 * Dedicated), usado por testes e pela CLI de exemplo. Nunca dado real,
 * nunca persistido.
 */
export function createDemoTenants(): Tenant[] {
  return [
    baseDemoTenant(),
    baseDemoTenant({
      clientName: "Loja Exemplo Pro",
      clientSlug: "loja-exemplo-pro",
      domain: "crm.loja-exemplo.com.br",
      plan: "pro",
      commercialStatus: "active",
      technicalStatus: "live",
      infrastructure: { target: "vercel", projectReference: "prj_demo123" },
      supabase: { projectRef: "demoref", projectUrl: "https://demoref.supabase.co" },
    }),
    baseDemoTenant({
      clientName: "Clínica Dedicada Exemplo",
      clientSlug: "clinica-dedicada-exemplo",
      domain: "crm.clinica-exemplo.com.br",
      plan: "dedicated",
      requestedModules: ["core.contacts", "core.pipeline", "channel.whatsapp"],
      enabledModules: ["core.contacts", "core.pipeline", "channel.whatsapp"],
      commercialStatus: "contracted",
      technicalStatus: "provisioning",
      infrastructure: { target: "vps", provider: "hostgator", externalId: "vps-demo-001" },
      supabase: { projectRef: "clinicaref", projectUrl: "https://clinicaref.supabase.co" },
      accountManager: { name: "Responsável Demo", email: "am@brighter.invalid" },
    }),
  ];
}
