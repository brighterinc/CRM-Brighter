import { describe, expect, it } from "vitest";

import { MODULE_CATALOG, getModuleDefinition } from "@/lib/modules/catalog";

describe("MODULE_CATALOG", () => {
  it("não tem ids duplicados", () => {
    const ids = MODULE_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("automation.campaigns é planned, depende de core.contacts e exige scheduler+worker", () => {
    const campaigns = getModuleDefinition("automation.campaigns");
    expect(campaigns).toBeDefined();
    expect(campaigns?.status).toBe("planned");
    expect(campaigns?.defaultEnabled).toBe(false);
    expect(campaigns?.dependsOn).toContain("core.contacts");
    expect(campaigns?.requires.scheduler).toBe(true);
    expect(campaigns?.requires.worker).toBe(true);
  });

  it("integration.lumina e integration.sphere são planned", () => {
    expect(getModuleDefinition("integration.lumina")?.status).toBe("planned");
    expect(getModuleDefinition("integration.sphere")?.status).toBe("planned");
    expect(getModuleDefinition("integration.lumina")?.defaultEnabled).toBe(false);
    expect(getModuleDefinition("integration.sphere")?.defaultEnabled).toBe(false);
  });

  it("channel.whatsapp só permite o plano dedicated", () => {
    expect(getModuleDefinition("channel.whatsapp")?.allowedPlans).toEqual(["dedicated"]);
  });

  it("core.contacts e core.pipeline incluem o plano lite", () => {
    expect(getModuleDefinition("core.contacts")?.allowedPlans).toContain("lite");
    expect(getModuleDefinition("core.pipeline")?.allowedPlans).toContain("lite");
  });

  it("getModuleDefinition retorna undefined pra id desconhecido", () => {
    expect(getModuleDefinition("nao.existe")).toBeUndefined();
  });
});
