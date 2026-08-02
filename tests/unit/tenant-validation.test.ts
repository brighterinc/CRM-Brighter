import { describe, expect, it } from "vitest";

import { validateTenantInput } from "@/lib/tenants/validation";
import type { Tenant } from "@/lib/tenants/types";

function baseTenant(overrides: Partial<Tenant> = {}): Partial<Tenant> {
  const now = new Date().toISOString();
  return {
    id: "11111111-1111-4111-8111-111111111111",
    clientName: "Empresa Exemplo",
    clientSlug: "empresa-exemplo",
    domain: "crm.empresa.com.br",
    plan: "lite",
    requestedModules: ["core.contacts"],
    enabledModules: ["core.contacts"],
    branding: { appName: "Empresa Exemplo" },
    commercialStatus: "lead",
    technicalStatus: "draft",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("validateTenantInput", () => {
  it("tenant válido não produz erros", () => {
    expect(validateTenantInput(baseTenant())).toEqual([]);
  });

  it("clientName vazio vira erro estruturado", () => {
    const errors = validateTenantInput(baseTenant({ clientName: "" }));
    expect(errors).toContainEqual({ field: "clientName", message: expect.stringContaining("vazio") });
  });

  it("clientSlug inválido", () => {
    const errors = validateTenantInput(baseTenant({ clientSlug: "Slug Inválido!" }));
    expect(errors.some((e) => e.field === "clientSlug")).toBe(true);
  });

  it("domain inválido", () => {
    const errors = validateTenantInput(baseTenant({ domain: "not a domain" }));
    expect(errors.some((e) => e.field === "domain")).toBe(true);
  });

  it("plan inválido", () => {
    const errors = validateTenantInput(baseTenant({ plan: "enterprise" as never }));
    expect(errors.some((e) => e.field === "plan")).toBe(true);
  });

  it("commercialStatus inválido", () => {
    const errors = validateTenantInput(baseTenant({ commercialStatus: "vip" as never }));
    expect(errors.some((e) => e.field === "commercialStatus")).toBe(true);
  });

  it("technicalStatus inválido", () => {
    const errors = validateTenantInput(baseTenant({ technicalStatus: "flying" as never }));
    expect(errors.some((e) => e.field === "technicalStatus")).toBe(true);
  });

  it("id não é UUID", () => {
    const errors = validateTenantInput(baseTenant({ id: "not-a-uuid" }));
    expect(errors.some((e) => e.field === "id")).toBe(true);
  });

  it("e-mail de contato inválido", () => {
    const errors = validateTenantInput(
      baseTenant({ primaryContact: { name: "Fulano", email: "not-an-email" } }),
    );
    expect(errors.some((e) => e.field === "primaryContact.email")).toBe(true);
  });

  it("nome de contato vazio", () => {
    const errors = validateTenantInput(
      baseTenant({ accountManager: { name: "", email: "am@empresa.invalid" } }),
    );
    expect(errors.some((e) => e.field === "accountManager.name")).toBe(true);
  });

  it("createdAt/updatedAt não-ISO", () => {
    const errors = validateTenantInput(baseTenant({ createdAt: "ontem", updatedAt: "hoje" }));
    expect(errors.some((e) => e.field === "createdAt")).toBe(true);
    expect(errors.some((e) => e.field === "updatedAt")).toBe(true);
  });

  it("módulo desconhecido no catálogo (requestedModules)", () => {
    const errors = validateTenantInput(baseTenant({ requestedModules: ["modulo.inexistente"] }));
    expect(errors.some((e) => e.field === "requestedModules")).toBe(true);
  });

  it("módulo desconhecido no catálogo (enabledModules)", () => {
    const errors = validateTenantInput(baseTenant({ enabledModules: ["modulo.inexistente"] }));
    expect(errors.some((e) => e.field === "enabledModules")).toBe(true);
  });

  it("branding ausente", () => {
    const errors = validateTenantInput(baseTenant({ branding: undefined }));
    expect(errors.some((e) => e.field === "branding")).toBe(true);
  });

  it("branding.appName vazio (blocker do Deployment Engine reusado)", () => {
    const errors = validateTenantInput(baseTenant({ branding: { appName: "" } }));
    expect(errors.some((e) => e.field === "branding")).toBe(true);
  });
});
