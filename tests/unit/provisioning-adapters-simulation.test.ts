import { describe, expect, it } from "vitest";

import { PROVISIONING_ADAPTER_SIMULATION_SCENARIOS, simulateProvisioningAdapterScenario } from "@/lib/provisioning-adapters";
import type { ProvisioningAdapterSimulationScenario } from "@/lib/provisioning-adapters";

const READY_SCENARIOS: ProvisioningAdapterSimulationScenario[] = [
  "supabase-ready",
  "vercel-ready",
  "dns-ready",
  "vps-ready",
  "docker-ready",
  "redis-ready",
  "whatsapp-ready",
  "chatwoot-ready",
  "evolution-ready",
  "waha-ready",
];

describe("simulateProvisioningAdapterScenario — 22 cenários nomeados", () => {
  it("PROVISIONING_ADAPTER_SIMULATION_SCENARIOS tem exatamente 22 cenários, sem duplicata", () => {
    expect(PROVISIONING_ADAPTER_SIMULATION_SCENARIOS).toHaveLength(22);
    expect(new Set(PROVISIONING_ADAPTER_SIMULATION_SCENARIOS).size).toBe(22);
  });

  it.each(PROVISIONING_ADAPTER_SIMULATION_SCENARIOS)("%s roda sem lançar, sempre devolve installation/plan", async (scenario) => {
    const result = await simulateProvisioningAdapterScenario(scenario);
    expect(result.scenario).toBe(scenario);
    expect(result.installation).toBeDefined();
    expect(result.plan).toBeDefined();
  });

  it("lite-healthy / pro-healthy / dedicated-healthy nunca reportam blocker", async () => {
    for (const scenario of ["lite-healthy", "pro-healthy", "dedicated-healthy"] as const) {
      const result = await simulateProvisioningAdapterScenario(scenario);
      expect(result.blockers).toEqual([]);
      expect(result.plan.blockers).toEqual([]);
      expect(result.outcomes.some((o) => o.mapping.status === "resolved")).toBe(true);
    }
  });

  it("missing-adapter — remover supabase bloqueia toda etapa mapeada (cascata total)", async () => {
    const result = await simulateProvisioningAdapterScenario("missing-adapter");
    const mapped = result.outcomes.filter((o) => o.mapping.status !== "unmapped");
    expect(mapped.length).toBeGreaterThan(0);
    expect(mapped.every((o) => o.mapping.status !== "resolved" || o.result?.status !== "ready")).toBe(true);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("capability-missing — vercel sem project.create bloqueia etapas de frontend", async () => {
    const result = await simulateProvisioningAdapterScenario("capability-missing");
    const frontend = result.outcomes.find((o) => o.stepId === "create_frontend_project");
    expect(frontend?.mapping.status).toBe("missing_capability");
  });

  it("dependency-failure — remover vps bloqueia install_runtime e a cascata dedicated", async () => {
    const result = await simulateProvisioningAdapterScenario("dependency-failure");
    const prepareVps = result.outcomes.find((o) => o.stepId === "prepare_vps");
    expect(prepareVps?.mapping.status).toBe("missing_adapter");
    const installRuntime = result.outcomes.find((o) => o.stepId === "install_runtime");
    expect(installRuntime?.result?.status).toBe("blocked");
  });

  it("partial — mistura real de prontas e bloqueadas (nem tudo, nem nada)", async () => {
    const result = await simulateProvisioningAdapterScenario("partial");
    const readyCount = result.outcomes.filter((o) => o.result?.status === "ready").length;
    const blockedCount = result.outcomes.filter((o) => o.mapping.status !== "resolved" || o.result?.status === "blocked").length;
    expect(readyCount).toBeGreaterThan(0);
    expect(blockedCount).toBeGreaterThan(0);
  });

  it("blocker — plan.blockers sintético impede toda execução (outcomes vazio)", async () => {
    const result = await simulateProvisioningAdapterScenario("blocker");
    expect(result.plan.blockers.length).toBeGreaterThan(0);
    expect(result.outcomes).toEqual([]);
  });

  it("failed-step — sentinela produz status failed", async () => {
    const result = await simulateProvisioningAdapterScenario("failed-step");
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]?.result?.status).toBe("failed");
  });

  it("invalid-request — request malformado produz status blocked com blockers de validação", async () => {
    const result = await simulateProvisioningAdapterScenario("invalid-request");
    expect(result.outcomes[0]?.result?.status).toBe("blocked");
    expect(result.outcomes[0]?.result?.blockers.length).toBeGreaterThan(0);
  });

  it("idempotent-repeat — 2ª rodada reusa exatamente os mesmos requestId", async () => {
    const result = await simulateProvisioningAdapterScenario("idempotent-repeat");
    expect(result.repeatedRun?.matched).toBe(true);
    expect(result.repeatedRun?.firstRequestIds).toEqual(result.repeatedRun?.secondRequestIds);
    expect(result.repeatedRun?.firstRequestIds.length).toBeGreaterThan(0);
  });

  it.each(READY_SCENARIOS)("%s — um único outcome resolvido e pronto/simulado", async (scenario) => {
    const result = await simulateProvisioningAdapterScenario(scenario);
    expect(result.outcomes).toHaveLength(1);
    const outcome = result.outcomes[0]!;
    expect(outcome.mapping.status).toBe("resolved");
    expect(["ready", "simulated"]).toContain(outcome.result?.status);
  });

  it("rollback-preview — dry-run saudável com rollbackPreview populado", async () => {
    const result = await simulateProvisioningAdapterScenario("rollback-preview");
    expect(result.rollbackPreview.length).toBeGreaterThan(0);
    expect(result.rollbackPreview.some((r) => r.reversible)).toBe(true);
  });
});
