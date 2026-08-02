import { describe, expect, it } from "vitest";

import { generateDeploymentManifest } from "@/lib/deployment";
import { evaluateTenantReadiness } from "@/lib/tenants/readiness";
import type { Tenant } from "@/lib/tenants/types";

function readyTenant(overrides: Partial<Tenant> = {}): Tenant {
  const now = new Date().toISOString();
  const plan = overrides.plan ?? "lite";
  const requestedModules = overrides.requestedModules ?? ["core.contacts", "core.pipeline"];
  const branding = overrides.branding ?? {
    appName: "Empresa Exemplo",
    supportEmail: "suporte@empresa-exemplo.invalid",
  };
  const manifest =
    "manifest" in overrides
      ? overrides.manifest
      : generateDeploymentManifest({
          clientName: "Empresa Exemplo",
          clientSlug: "empresa-exemplo",
          domain: "crm.empresa.com.br",
          plan,
          requestedModules,
          branding,
        });

  return {
    id: "11111111-1111-4111-8111-111111111111",
    clientName: "Empresa Exemplo",
    clientSlug: "empresa-exemplo",
    domain: "crm.empresa.com.br",
    plan,
    requestedModules,
    enabledModules: manifest?.enabledModules ?? [],
    branding,
    commercialStatus: "contracted",
    technicalStatus: "ready_to_provision",
    accountManager: { name: "Fulano", email: "fulano@brighter.invalid" },
    infrastructure:
      plan === "dedicated"
        ? { target: "vps", provider: "hostgator", externalId: "vps-001" }
        : { target: "vercel", projectReference: "prj_123" },
    supabase: { projectRef: "abcxyz", projectUrl: "https://abcxyz.supabase.co" },
    manifest,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("evaluateTenantReadiness — tenant vazio", () => {
  it("score determinístico quando quase nada está preenchido", () => {
    const now = new Date().toISOString();
    const tenant: Tenant = {
      id: "11111111-1111-4111-8111-111111111111",
      clientName: "",
      clientSlug: "x",
      domain: "not a domain",
      plan: "lite",
      requestedModules: [],
      enabledModules: [],
      branding: { appName: "" },
      commercialStatus: "lead",
      technicalStatus: "draft",
      createdAt: now,
      updatedAt: now,
    };

    const readiness = evaluateTenantReadiness(tenant);

    // Só os 3 itens de módulos passam trivialmente (arrays vazios) — 5+5+5.
    expect(readiness.score).toBe(15);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.length).toBeGreaterThan(0);
  });
});

describe("evaluateTenantReadiness — planos completos", () => {
  it("tenant Lite completo fica pronto (score 100)", () => {
    const readiness = evaluateTenantReadiness(readyTenant({ plan: "lite" }));
    expect(readiness.ready).toBe(true);
    expect(readiness.score).toBe(100);
    expect(readiness.blockers).toEqual([]);
  });

  it("tenant Pro completo fica pronto (score 100)", () => {
    const readiness = evaluateTenantReadiness(readyTenant({ plan: "pro" }));
    expect(readiness.ready).toBe(true);
    expect(readiness.score).toBe(100);
    expect(readiness.blockers).toEqual([]);
  });

  it("tenant Dedicated completo (com WhatsApp) fica pronto (score 100)", () => {
    const requestedModules = ["core.contacts", "channel.whatsapp"];
    const readiness = evaluateTenantReadiness(readyTenant({ plan: "dedicated", requestedModules }));
    expect(readiness.ready).toBe(true);
    expect(readiness.score).toBe(100);
    expect(readiness.blockers).toEqual([]);
  });

  it("logo ausente é warning, nunca blocker — não impede prontidão nem reduz score", () => {
    const tenant = readyTenant({ plan: "lite" });
    expect(tenant.branding.logoUrl).toBeUndefined();

    const readiness = evaluateTenantReadiness(tenant);

    expect(readiness.warnings.some((w) => w.id === "branding.logo")).toBe(true);
    expect(readiness.ready).toBe(true);
    expect(readiness.score).toBe(100);
  });
});

describe("evaluateTenantReadiness — infraestrutura ausente por plano", () => {
  it("Dedicated sem referência de VPS gera blocker específico", () => {
    const tenant = readyTenant({ plan: "dedicated", infrastructure: undefined });
    const readiness = evaluateTenantReadiness(tenant);

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((b) => b.id === "infra.reference_present")).toBe(true);
  });

  it("Dedicated com target vps mas sem provider/externalId ainda bloqueia", () => {
    const tenant = readyTenant({ plan: "dedicated", infrastructure: { target: "vps" } });
    const readiness = evaluateTenantReadiness(tenant);

    expect(readiness.blockers.some((b) => b.id === "infra.reference_present")).toBe(true);
  });

  it("Lite sem referência de frontend (projectReference) gera blocker específico", () => {
    const tenant = readyTenant({ plan: "lite", infrastructure: { target: "vercel" } });
    const readiness = evaluateTenantReadiness(tenant);

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((b) => b.id === "infra.reference_present")).toBe(true);
  });

  it("target incompatível com o plano bloqueia infra.target_compatible", () => {
    const tenant = readyTenant({ plan: "lite", infrastructure: { target: "vps", projectReference: "x" } });
    const readiness = evaluateTenantReadiness(tenant);

    expect(readiness.blockers.some((b) => b.id === "infra.target_compatible")).toBe(true);
  });
});

describe("evaluateTenantReadiness — consistência de status técnico", () => {
  it('"ready_to_provision" com blockers pendentes vira warning', () => {
    const tenant = readyTenant({ commercialStatus: "lead" });
    const readiness = evaluateTenantReadiness(tenant);

    expect(readiness.blockers.some((b) => b.id === "commercial.contract_confirmed")).toBe(true);
    expect(readiness.warnings.some((w) => w.id === "status.ready_to_provision_with_blockers")).toBe(true);
  });

  it('"live" sem infraestrutura/manifesto completos vira warning', () => {
    const tenant = readyTenant({
      technicalStatus: "live",
      infrastructure: undefined,
      manifest: undefined,
      enabledModules: [],
    });
    const readiness = evaluateTenantReadiness(tenant);

    expect(readiness.warnings.some((w) => w.id === "status.live_without_infra_or_manifest")).toBe(true);
  });

  it("nenhuma inconsistência quando o tenant está de fato pronto e live", () => {
    const tenant = readyTenant({ technicalStatus: "live" });
    const readiness = evaluateTenantReadiness(tenant);

    expect(readiness.warnings.some((w) => w.category === "consistency")).toBe(false);
  });
});
