import { describe, expect, it } from "vitest";

import {
  findCapability,
  listCapabilitiesForProvider,
  PROVISIONING_ADAPTER_CAPABILITY_CATALOG,
  validateCapabilityCatalog,
} from "@/lib/provisioning-adapters";

describe("catálogo de capabilities", () => {
  it("nenhuma capability declara realExecutionAvailable=true", () => {
    for (const capability of PROVISIONING_ADAPTER_CAPABILITY_CATALOG) {
      expect(capability.realExecutionAvailable).toBe(false);
    }
  });

  it("todo id de capability é único", () => {
    const ids = PROVISIONING_ADAPTER_CAPABILITY_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("validateCapabilityCatalog não reporta blocker no catálogo real", () => {
    expect(validateCapabilityCatalog()).toEqual([]);
  });

  it("validateCapabilityCatalog detecta capability duplicada", () => {
    const dupCatalog = [...PROVISIONING_ADAPTER_CAPABILITY_CATALOG, PROVISIONING_ADAPTER_CAPABILITY_CATALOG[0]!];
    const blockers = validateCapabilityCatalog(dupCatalog);
    expect(blockers.some((b) => b.includes("duplicada"))).toBe(true);
  });

  it("validateCapabilityCatalog detecta realExecutionAvailable=true", () => {
    const badCatalog = [{ ...PROVISIONING_ADAPTER_CAPABILITY_CATALOG[0]!, realExecutionAvailable: true }];
    const blockers = validateCapabilityCatalog(badCatalog);
    expect(blockers.some((b) => b.includes("realExecutionAvailable=true"))).toBe(true);
  });

  it("listCapabilitiesForProvider filtra por provider", () => {
    const supabaseCaps = listCapabilitiesForProvider("supabase");
    expect(supabaseCaps.length).toBeGreaterThan(0);
    expect(supabaseCaps.every((c) => c.provider === "supabase")).toBe(true);
  });

  it("findCapability encontra por provider+operation", () => {
    const capability = findCapability("supabase", "project.create");
    expect(capability?.id).toBe("supabase.project.create");
    expect(findCapability("supabase", "operacao.inexistente")).toBeUndefined();
  });

  it("vercel só suporta lite/pro; vps/docker/redis/dns/reverse_proxy só dedicated", () => {
    for (const c of listCapabilitiesForProvider("vercel")) expect(c.supportedPlans).toEqual(["lite", "pro"]);
    for (const provider of ["vps", "docker", "redis", "dns", "reverse_proxy"] as const) {
      for (const c of listCapabilitiesForProvider(provider)) expect(c.supportedPlans).toEqual(["dedicated"]);
    }
  });
});
