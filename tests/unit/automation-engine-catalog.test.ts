import { describe, expect, it } from "vitest";

import { MODULE_CATALOG } from "@/lib/modules/catalog";
import {
  getWorkflowActionDefinition,
  getWorkflowTriggerDefinition,
  resolveApplicableWorkflowActions,
  resolveApplicableWorkflowTriggers,
  WORKFLOW_ACTION_CATALOG,
  WORKFLOW_TRIGGER_CATALOG,
} from "@/lib/automation-engine/catalog";

describe("WORKFLOW_TRIGGER_CATALOG / WORKFLOW_ACTION_CATALOG", () => {
  it("todo requiresModule referencia um id existente no MODULE_CATALOG", () => {
    const moduleIds = new Set(MODULE_CATALOG.map((m) => m.id));
    for (const trigger of WORKFLOW_TRIGGER_CATALOG) {
      expect(moduleIds.has(trigger.requiresModule)).toBe(true);
    }
    for (const action of WORKFLOW_ACTION_CATALOG) {
      expect(moduleIds.has(action.requiresModule)).toBe(true);
    }
  });

  it("sem id duplicado em nenhum dos dois catálogos", () => {
    const triggerIds = WORKFLOW_TRIGGER_CATALOG.map((t) => t.id);
    const actionIds = WORKFLOW_ACTION_CATALOG.map((a) => a.id);
    expect(new Set(triggerIds).size).toBe(triggerIds.length);
    expect(new Set(actionIds).size).toBe(actionIds.length);
  });

  it("getWorkflowTriggerDefinition/getWorkflowActionDefinition acham por id, undefined se não existe", () => {
    expect(getWorkflowTriggerDefinition("lead.created")?.name).toBe("Lead criado");
    expect(getWorkflowTriggerDefinition("inexistente")).toBeUndefined();
    expect(getWorkflowActionDefinition("add_tag")?.legacyActionType).toBe("add_tag");
    expect(getWorkflowActionDefinition("inexistente")).toBeUndefined();
  });

  it("campaign_step_due referencia automation.campaigns, que é status:planned no Module Engine", () => {
    const trigger = getWorkflowTriggerDefinition("campaign_step_due")!;
    const moduleDef = MODULE_CATALOG.find((m) => m.id === trigger.requiresModule)!;
    expect(moduleDef.status).toBe("planned");
  });

  it("resolveApplicableWorkflowTriggers/Actions filtram por módulo habilitado e plano", () => {
    const triggers = resolveApplicableWorkflowTriggers(["automation.webhooks"], "dedicated");
    expect(triggers.every((t) => t.requiresModule === "automation.webhooks")).toBe(true);
    expect(triggers.length).toBeGreaterThan(0);

    const noTriggers = resolveApplicableWorkflowTriggers([], "dedicated");
    expect(noTriggers).toEqual([]);

    const actions = resolveApplicableWorkflowActions(["core.contacts"], "dedicated");
    expect(actions.map((a) => a.id)).toEqual(["add_tag"]);
  });

  it("resolveApplicableWorkflowActions nunca inclui ação fora de appliesToPlans", () => {
    const actions = resolveApplicableWorkflowActions(
      WORKFLOW_ACTION_CATALOG.map((a) => a.requiresModule),
      "lite",
    );
    for (const a of actions) {
      expect(a.appliesToPlans).toContain("lite");
    }
  });
});
