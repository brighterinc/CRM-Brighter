import { describe, expect, it } from "vitest";

import { exportTenantSafe, sanitizeDeep } from "@/lib/tenants/export";
import type { Tenant } from "@/lib/tenants/types";

const SECRET_KEYS = [
  "password",
  "token",
  "apiKey",
  "secret",
  "serviceRoleKey",
  "databaseUrl",
  "connectionString",
  "sshKey",
];

function baseTenant(overrides: Partial<Tenant> = {}): Tenant {
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
    commercialStatus: "active",
    technicalStatus: "live",
    infrastructure: { target: "vercel", projectReference: "prj_123" },
    supabase: { projectRef: "abcxyz", projectUrl: "https://abcxyz.supabase.co" },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("sanitizeDeep", () => {
  it("mantém objeto sem chave sensível intacto", () => {
    const input = { a: 1, b: { c: "ok" } };
    expect(sanitizeDeep(input)).toEqual(input);
  });

  it("remove chave sensível no nível raiz", () => {
    const result = sanitizeDeep({ name: "ok", password: "hunter2" }) as Record<string, unknown>;
    expect(result).toEqual({ name: "ok" });
  });

  it("remove chave sensível em objeto aninhado", () => {
    const result = sanitizeDeep({
      tenant: { name: "ok", supabase: { serviceRoleKey: "sk-xxx", projectRef: "abc" } },
    }) as never;
    expect(result).toEqual({ tenant: { name: "ok", supabase: { projectRef: "abc" } } });
  });

  it("remove chave sensível em array de objetos", () => {
    const result = sanitizeDeep([
      { name: "a", token: "t1" },
      { name: "b", apiKey: "k2" },
    ]) as unknown[];
    expect(result).toEqual([{ name: "a" }, { name: "b" }]);
  });

  it("remove cada uma das chaves banidas, em qualquer profundidade", () => {
    for (const key of SECRET_KEYS) {
      const dirty = { nested: { deeper: { [key]: "valor-secreto", safe: "ok" } } };
      const clean = sanitizeDeep(dirty) as { nested: { deeper: Record<string, unknown> } };
      expect(clean.nested.deeper).not.toHaveProperty(key);
      expect(clean.nested.deeper.safe).toBe("ok");
    }
  });

  it("não muta o objeto de entrada", () => {
    const input = { password: "hunter2", name: "ok" };
    sanitizeDeep(input);
    expect(input).toEqual({ password: "hunter2", name: "ok" });
  });
});

describe("exportTenantSafe", () => {
  it("inclui os campos públicos esperados", () => {
    const result = exportTenantSafe(baseTenant());
    expect(result).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      clientName: "Empresa Exemplo",
      clientSlug: "empresa-exemplo",
      plan: "lite",
      commercialStatus: "active",
      technicalStatus: "live",
    });
    expect(result).toHaveProperty("readiness");
  });

  it("nunca inclui primaryContact/accountManager (fora do escopo do export)", () => {
    const tenant = baseTenant({
      primaryContact: { name: "Fulano", email: "fulano@empresa.invalid" },
      accountManager: { name: "Ciclana", email: "ciclana@brighter.invalid" },
    });
    const result = exportTenantSafe(tenant);
    expect(result).not.toHaveProperty("primaryContact");
    expect(result).not.toHaveProperty("accountManager");
  });

  it("remove propriedade de segredo mesmo quando o tenant de entrada está 'sujo' em runtime", () => {
    // TypeScript não protege isto em runtime — simula um objeto vindo de JSON
    // externo malformado, com propriedade extra fora do tipo `Tenant`.
    const dirty = {
      ...baseTenant(),
      serviceRoleKey: "sk-real-secret",
      supabase: { projectRef: "abcxyz", projectUrl: "https://abcxyz.supabase.co", databaseUrl: "postgres://real" },
    } as unknown as Tenant;

    const result = exportTenantSafe(dirty);
    const serialized = JSON.stringify(result);

    expect(result).not.toHaveProperty("serviceRoleKey");
    expect(serialized).not.toContain("sk-real-secret");
    expect(serialized).not.toContain("postgres://real");
  });

  it("o JSON final não casa com nenhuma das chaves de segredo banidas", () => {
    const tenant = baseTenant();
    const dirty = { ...tenant, apiKey: "k", sshKey: "ssh-rsa AAAA", connectionString: "postgres://x" };
    const serialized = JSON.stringify(exportTenantSafe(dirty as unknown as Tenant)).toLowerCase();

    for (const key of SECRET_KEYS) {
      expect(serialized).not.toContain(key.toLowerCase());
    }
  });
});
