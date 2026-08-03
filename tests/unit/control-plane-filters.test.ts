import { describe, expect, it } from "vitest";

import { applyInstallationFilters, matchesInstallationFilter } from "@/lib/control-plane/filters";
import { createDemoInstallations } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";

describe("applyInstallationFilters / matchesInstallationFilter", () => {
  const installations = createDemoInstallations();
  const lite = installations.find((i) => i.deploymentPlan === "lite")!;
  const pro = installations.find((i) => i.deploymentPlan === "pro")!;
  const dedicated = installations.find((i) => i.deploymentPlan === "dedicated")!;

  it("filtra por plano", () => {
    const result = applyInstallationFilters(installations, { plan: "pro" });
    expect(result).toEqual([pro]);
  });

  it("filtra por status", () => {
    const result = applyInstallationFilters(installations, { status: lite.status });
    expect(result.every((i) => i.status === lite.status)).toBe(true);
  });

  it("filtra por commercial", () => {
    const result = applyInstallationFilters(installations, { commercial: dedicated.commercial });
    expect(result.every((i) => i.commercial === dedicated.commercial)).toBe(true);
  });

  it("filtra por technical", () => {
    const result = applyInstallationFilters(installations, { technical: pro.technical });
    expect(result.every((i) => i.technical === pro.technical)).toBe(true);
  });

  it("filtra por domínio, case-insensitive e por substring", () => {
    const fragment = lite.tenant.domain.slice(0, 5).toUpperCase();
    const result = applyInstallationFilters(installations, { domain: fragment });
    expect(result.map((i) => i.id)).toContain(lite.id);
  });

  it("filtra por empresa, case-insensitive e por substring", () => {
    const fragment = pro.company.slice(0, 4).toUpperCase();
    const result = applyInstallationFilters(installations, { company: fragment });
    expect(result.map((i) => i.id)).toContain(pro.id);
  });

  it("filtra por módulo presente", () => {
    const moduleId = dedicated.modules[0]!;
    const result = applyInstallationFilters(installations, { module: moduleId });
    expect(result.every((i) => i.modules.includes(moduleId))).toBe(true);
    expect(result.map((i) => i.id)).toContain(dedicated.id);
  });

  it("filtra por módulo ausente devolve lista vazia", () => {
    const result = applyInstallationFilters(installations, { module: "modulo.que.nao.existe" });
    expect(result).toEqual([]);
  });

  it("filtra por brand (branding.appName), case-insensitive", () => {
    const fragment = lite.branding.appName.slice(0, 4).toUpperCase();
    const result = applyInstallationFilters(installations, { brand: fragment });
    expect(result.map((i) => i.id)).toContain(lite.id);
  });

  it("filtra por createdAfter/createdBefore", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString();

    expect(applyInstallationFilters(installations, { createdAfter: future })).toEqual([]);
    expect(applyInstallationFilters(installations, { createdBefore: past })).toEqual([]);
    expect(applyInstallationFilters(installations, { createdAfter: past, createdBefore: future })).toEqual(
      installations,
    );
  });

  it("combina múltiplos filtros com AND", () => {
    const result = applyInstallationFilters(installations, { plan: "lite", status: lite.status });
    expect(result).toEqual([lite]);
  });

  it("filtro vazio devolve tudo", () => {
    expect(applyInstallationFilters(installations, {})).toEqual(installations);
  });

  it("matchesInstallationFilter confere uma instalação isolada", () => {
    expect(matchesInstallationFilter(lite, { plan: "lite" })).toBe(true);
    expect(matchesInstallationFilter(lite, { plan: "dedicated" })).toBe(false);
  });

  it("matchesInstallationFilter combina critério de plano E status (AND, nunca OR)", () => {
    const wrongStatus: Installation["status"] = lite.status === "active" ? "paused" : "active";
    expect(matchesInstallationFilter(lite, { plan: "lite", status: wrongStatus })).toBe(false);
  });
});
