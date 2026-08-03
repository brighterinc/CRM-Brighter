import { describe, expect, it } from "vitest";

import { getMonitoringCheckDefinition, MONITORING_CHECK_CATALOG } from "@/lib/monitoring/catalog";

describe("MONITORING_CHECK_CATALOG — sanidade", () => {
  it("nenhum id de check é duplicado", () => {
    const ids = MONITORING_CHECK_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getMonitoringCheckDefinition devolve undefined pra id desconhecido", () => {
    expect(getMonitoringCheckDefinition("check_inexistente")).toBeUndefined();
  });

  it("getMonitoringCheckDefinition devolve a definição certa por id", () => {
    const def = getMonitoringCheckDefinition("database_reachable");
    expect(def).toBeDefined();
    expect(def!.category).toBe("database");
    expect(def!.severityWhenFailed).toBe("critical");
  });

  it("checks Dedicated-only (Redis/worker) nunca aparecem em Lite/Pro", () => {
    const dedicatedOnlyIds = ["vps_reachable", "runtime_available", "reverse_proxy_available", "redis_available", "worker_running"];
    for (const id of dedicatedOnlyIds) {
      const def = getMonitoringCheckDefinition(id);
      expect(def, `check "${id}" deveria existir`).toBeDefined();
      expect(def!.appliesToPlans).toEqual(["dedicated"]);
    }
  });

  it("checks Lite/Pro-only nunca aparecem em Dedicated", () => {
    const litePro = ["frontend_deployment_available", "supabase_project_configured", "supabase_auth_available"];
    for (const id of litePro) {
      const def = getMonitoringCheckDefinition(id);
      expect(def, `check "${id}" deveria existir`).toBeDefined();
      expect(def!.appliesToPlans).not.toContain("dedicated");
    }
  });

  it("redis_available/worker_running exigem infra correspondente (requiresInfra)", () => {
    expect(getMonitoringCheckDefinition("redis_available")!.requiresInfra).toEqual(["redis"]);
    expect(getMonitoringCheckDefinition("worker_running")!.requiresInfra).toEqual(["worker"]);
    expect(getMonitoringCheckDefinition("scheduler_running")!.requiresInfra).toEqual(["scheduler"]);
  });

  it("checks de canal exigem o módulo correspondente (requiredModules)", () => {
    expect(getMonitoringCheckDefinition("whatsapp_channel_configured")!.requiredModules).toEqual(["channel.whatsapp"]);
    expect(getMonitoringCheckDefinition("waha_available")!.requiredModules).toEqual(["channel.whatsapp"]);
    expect(getMonitoringCheckDefinition("email_provider_configured")!.requiredModules).toEqual(["channel.email"]);
  });

  it("chatwoot_available/evolution_available existem mas nascem enabledByDefault: false", () => {
    const chatwoot = getMonitoringCheckDefinition("chatwoot_available");
    const evolution = getMonitoringCheckDefinition("evolution_available");
    expect(chatwoot).toBeDefined();
    expect(evolution).toBeDefined();
    expect(chatwoot!.enabledByDefault).toBe(false);
    expect(evolution!.enabledByDefault).toBe(false);
    // Referenciam ids de módulo que não existem no Module Engine — catálogo-only.
    expect(chatwoot!.requiredModules).toEqual(["channel.chatwoot"]);
    expect(evolution!.requiredModules).toEqual(["channel.evolution"]);
  });

  it("todo check tem nome, descrição e categoria não-vazios", () => {
    for (const def of MONITORING_CHECK_CATALOG) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.category.length).toBeGreaterThan(0);
    }
  });
});
