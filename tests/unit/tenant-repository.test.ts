import { describe, expect, it } from "vitest";

import {
  createDemoTenants,
  InMemoryTenantRepository,
  TenantNotFoundError,
  TenantValidationFailedError,
  type TenantCreateInput,
} from "@/lib/tenants/repository";

function validCreateInput(overrides: Partial<TenantCreateInput> = {}): TenantCreateInput {
  return {
    clientName: "Empresa Exemplo",
    clientSlug: "empresa-exemplo",
    domain: "crm.empresa.com.br",
    plan: "lite",
    requestedModules: ["core.contacts"],
    enabledModules: ["core.contacts"],
    branding: { appName: "Empresa Exemplo" },
    commercialStatus: "lead",
    technicalStatus: "draft",
    ...overrides,
  };
}

describe("InMemoryTenantRepository", () => {
  it("create() gera id/createdAt/updatedAt e persiste em memória", async () => {
    const repo = new InMemoryTenantRepository();
    const tenant = await repo.create(validCreateInput());

    expect(tenant.id).toBeTruthy();
    expect(tenant.createdAt).toBe(tenant.updatedAt);
    expect(await repo.findById(tenant.id)).toEqual(tenant);
  });

  it("create() com dado inválido lança TenantValidationFailedError com erros estruturados", async () => {
    const repo = new InMemoryTenantRepository();

    await expect(repo.create(validCreateInput({ clientName: "" }))).rejects.toBeInstanceOf(
      TenantValidationFailedError,
    );

    try {
      await repo.create(validCreateInput({ clientName: "" }));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TenantValidationFailedError);
      const validationError = err as TenantValidationFailedError;
      expect(validationError.errors.some((e) => e.field === "clientName")).toBe(true);
    }
  });

  it("list() devolve todos os tenants criados", async () => {
    const repo = new InMemoryTenantRepository();
    await repo.create(validCreateInput({ clientSlug: "cliente-a" }));
    await repo.create(validCreateInput({ clientSlug: "cliente-b" }));

    const all = await repo.list();
    expect(all).toHaveLength(2);
  });

  it("findBySlug() encontra pelo slug e devolve null quando não existe", async () => {
    const repo = new InMemoryTenantRepository();
    const tenant = await repo.create(validCreateInput({ clientSlug: "achavel" }));

    expect(await repo.findBySlug("achavel")).toEqual(tenant);
    expect(await repo.findBySlug("inexistente")).toBeNull();
  });

  it("update() aplica patch parcial e revalida o objeto mergeado", async () => {
    const repo = new InMemoryTenantRepository();
    const tenant = await repo.create(validCreateInput());

    const updated = await repo.update(tenant.id, { commercialStatus: "contracted" });

    expect(updated.commercialStatus).toBe("contracted");
    expect(updated.clientName).toBe(tenant.clientName);
    expect(updated.createdAt).toBe(tenant.createdAt);
  });

  it("update() com patch que invalida o tenant lança TenantValidationFailedError", async () => {
    const repo = new InMemoryTenantRepository();
    const tenant = await repo.create(validCreateInput());

    await expect(repo.update(tenant.id, { domain: "not a domain" })).rejects.toBeInstanceOf(
      TenantValidationFailedError,
    );
  });

  it("update() de id inexistente lança TenantNotFoundError", async () => {
    const repo = new InMemoryTenantRepository();
    await expect(repo.update("does-not-exist", { notes: "x" })).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it("aceita seed inicial no construtor (catálogo de demonstração)", async () => {
    const repo = new InMemoryTenantRepository(createDemoTenants());
    const all = await repo.list();
    expect(all.length).toBeGreaterThanOrEqual(3);
  });
});

describe("createDemoTenants", () => {
  it("cobre os três planos (Lite/Pro/Dedicated)", () => {
    const demo = createDemoTenants();
    const plans = new Set(demo.map((t) => t.plan));
    expect(plans).toEqual(new Set(["lite", "pro", "dedicated"]));
  });
});
