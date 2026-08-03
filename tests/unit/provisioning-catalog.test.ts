import { describe, expect, it } from "vitest";

import {
  detectCircularStepDependencies,
  getProvisioningStepDefinition,
  PROVISIONING_STEP_CATALOG,
  validateStepCatalog,
} from "@/lib/provisioning";

describe("PROVISIONING_STEP_CATALOG — sanidade", () => {
  it("todo dependsOn aponta pra id existente, sem etapa duplicada", () => {
    expect(validateStepCatalog(PROVISIONING_STEP_CATALOG)).toEqual([]);
  });

  it("não tem dependência circular", () => {
    expect(detectCircularStepDependencies(PROVISIONING_STEP_CATALOG)).toBeNull();
  });

  it("etapas Dedicated-only nunca aparecem em Lite/Pro", () => {
    const dedicatedOnlyIds = [
      "prepare_vps",
      "install_runtime",
      "configure_reverse_proxy",
      "configure_redis",
      "configure_worker",
      "configure_scheduler",
      "configure_backup",
      "configure_monitoring",
    ];
    for (const id of dedicatedOnlyIds) {
      const def = getProvisioningStepDefinition(id);
      expect(def, `etapa "${id}" deveria existir`).toBeDefined();
      expect(def!.appliesToPlans).toEqual(["dedicated"]);
    }
  });

  it("etapas Lite/Pro-only nunca aparecem em Dedicated", () => {
    const litePro = ["create_frontend_project", "configure_frontend_environment", "deploy_frontend"];
    for (const id of litePro) {
      const def = getProvisioningStepDefinition(id);
      expect(def, `etapa "${id}" deveria existir`).toBeDefined();
      expect(def!.appliesToPlans).not.toContain("dedicated");
    }
  });

  it("getProvisioningStepDefinition devolve undefined pra id desconhecido", () => {
    expect(getProvisioningStepDefinition("etapa_inexistente")).toBeUndefined();
  });

  it("todo idempotencyKey é determinístico e no formato step.<id>", () => {
    for (const def of PROVISIONING_STEP_CATALOG) {
      expect(def.idempotencyKey).toBe(`step.${def.id}`);
    }
  });
});
