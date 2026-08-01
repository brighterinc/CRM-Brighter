import { describe, expect, it } from "vitest";

import { MODULE_CATALOG, type ModuleDefinition } from "@/lib/modules/catalog";
import {
  parseModuleIdList,
  resolveDeploymentPlan,
  resolveModuleAvailability,
} from "@/lib/modules/resolver";

function findEntry(entries: ReturnType<typeof resolveModuleAvailability>, id: string) {
  const entry = entries.find((e) => e.module.id === id);
  if (!entry) throw new Error(`módulo ${id} não está no resultado`);
  return entry;
}

describe("resolveDeploymentPlan", () => {
  it("cai em 'dedicated' quando ausente", () => {
    expect(resolveDeploymentPlan(undefined)).toBe("dedicated");
    expect(resolveDeploymentPlan(null)).toBe("dedicated");
  });

  it("cai em 'dedicated' quando string vazia ou inválida", () => {
    expect(resolveDeploymentPlan("")).toBe("dedicated");
    expect(resolveDeploymentPlan("nao-existe")).toBe("dedicated");
  });

  it("aceita os 3 planos válidos (case-insensitive, com espaço)", () => {
    expect(resolveDeploymentPlan("lite")).toBe("lite");
    expect(resolveDeploymentPlan("PRO")).toBe("pro");
    expect(resolveDeploymentPlan("  dedicated  ")).toBe("dedicated");
  });
});

describe("parseModuleIdList", () => {
  it("string vazia/ausente vira []", () => {
    expect(parseModuleIdList(undefined)).toEqual([]);
    expect(parseModuleIdList("")).toEqual([]);
  });

  it("separa por vírgula, remove espaço e entradas vazias", () => {
    expect(parseModuleIdList(" a, b ,, c")).toEqual(["a", "b", "c"]);
  });
});

describe("resolveModuleAvailability — instalação antiga (sem env vars)", () => {
  it("reproduz o comportamento atual: dedicated, tudo estável ligado", () => {
    const result = resolveModuleAvailability({ plan: "dedicated" });
    expect(findEntry(result, "channel.whatsapp").enabled).toBe(true);
    expect(findEntry(result, "ai.agents").enabled).toBe(true);
    expect(findEntry(result, "automation.webhooks").enabled).toBe(true);
    expect(findEntry(result, "compliance.lgpd").enabled).toBe(true);
    // planned nunca liga por padrão, mesmo em dedicated
    expect(findEntry(result, "automation.campaigns").enabled).toBe(false);
    expect(findEntry(result, "automation.campaigns").reason).toBe("not_enabled_by_default");
  });
});

describe("resolveModuleAvailability — plano lite", () => {
  it("core.contacts e core.pipeline disponíveis no lite", () => {
    const result = resolveModuleAvailability({ plan: "lite" });
    expect(findEntry(result, "core.contacts").enabled).toBe(true);
    expect(findEntry(result, "core.pipeline").enabled).toBe(true);
  });

  it("channel.whatsapp indisponível no lite mesmo via ENABLED_MODULES", () => {
    const result = resolveModuleAvailability({
      plan: "lite",
      enabledRaw: "channel.whatsapp",
    });
    const entry = findEntry(result, "channel.whatsapp");
    expect(entry.enabled).toBe(false);
    expect(entry.reason).toBe("plan_not_allowed");
  });
});

describe("resolveModuleAvailability — precedência", () => {
  it("DISABLED_MODULES vence ENABLED_MODULES pro mesmo id", () => {
    const result = resolveModuleAvailability({
      plan: "dedicated",
      enabledRaw: "automation.webhooks",
      disabledRaw: "automation.webhooks",
    });
    const entry = findEntry(result, "automation.webhooks");
    expect(entry.enabled).toBe(false);
    expect(entry.reason).toBe("explicitly_disabled");
  });

  it("dependência desabilitada desliga o módulo dependente (cascata)", () => {
    const result = resolveModuleAvailability({
      plan: "dedicated",
      disabledRaw: "core.contacts",
    });
    // automation.webhooks depende de core.contacts
    const entry = findEntry(result, "automation.webhooks");
    expect(entry.enabled).toBe(false);
    expect(entry.reason).toBe("dependency_disabled");
    expect(entry.blockedDependency).toBe("core.contacts");
  });

  it("cascata propaga por mais de um nível (ai.agents → ai.memory → ai.rag)", () => {
    const result = resolveModuleAvailability({
      plan: "dedicated",
      disabledRaw: "ai.agents",
    });
    expect(findEntry(result, "ai.memory").enabled).toBe(false);
    expect(findEntry(result, "ai.rag").enabled).toBe(false);
  });
});

describe("resolveModuleAvailability — módulo planned não liga por padrão", () => {
  it("automation.campaigns fica desligado mesmo no plano dedicated sem override", () => {
    const result = resolveModuleAvailability({ plan: "dedicated" });
    const entry = findEntry(result, "automation.campaigns");
    expect(entry.enabled).toBe(false);
    expect(entry.reason).toBe("not_enabled_by_default");
  });
});

describe("resolveModuleAvailability — catálogo customizado (isolamento)", () => {
  const fixtureCatalog: ModuleDefinition[] = [
    {
      id: "fixture.base",
      name: "Base",
      description: "",
      category: "core",
      defaultEnabled: true,
      allowedPlans: ["lite", "pro", "dedicated"],
      requires: {},
      status: "stable",
    },
    {
      id: "fixture.dependent",
      name: "Dependente",
      description: "",
      category: "core",
      defaultEnabled: true,
      allowedPlans: ["lite", "pro", "dedicated"],
      requires: {},
      dependsOn: ["fixture.base"],
      status: "stable",
    },
  ];

  it("desabilitar a base desliga o dependente com reason correta", () => {
    const result = resolveModuleAvailability({
      plan: "lite",
      disabledRaw: "fixture.base",
      catalog: fixtureCatalog,
    });
    expect(result).toHaveLength(2);
    const dependent = findEntry(result, "fixture.dependent");
    expect(dependent.enabled).toBe(false);
    expect(dependent.reason).toBe("dependency_disabled");
    expect(dependent.blockedDependency).toBe("fixture.base");
  });
});

describe("consistência com MODULE_CATALOG real", () => {
  it("resolve sem lançar pro catálogo inteiro em cada plano", () => {
    for (const plan of ["lite", "pro", "dedicated"] as const) {
      const result = resolveModuleAvailability({ plan });
      expect(result).toHaveLength(MODULE_CATALOG.length);
    }
  });
});
