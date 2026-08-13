import { describe, expect, it } from "vitest";

import {
  runAllSimulationScenarios,
  runSimulationScenario,
  simulationScenarioPassed,
  SIMULATION_SCENARIO_NAMES,
} from "@/lib/provider-credentials-runtime/simulation";

describe("cenários de simulação — cada um bate o outcome esperado (prova de CLI/`pnpm credentials:runtime`)", () => {
  for (const name of SIMULATION_SCENARIO_NAMES) {
    it(`\`${name}\` produz o outcome esperado`, async () => {
      const result = await runSimulationScenario(name);
      expect(simulationScenarioPassed(result)).toBe(true);
    });
  }
});

describe("runAllSimulationScenarios", () => {
  it("roda os 11 cenários e nenhum vaza valor de segredo no resultado", async () => {
    const results = await runAllSimulationScenarios();
    expect(results).toHaveLength(11);
    for (const result of results) {
      expect(simulationScenarioPassed(result)).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(/synthetic-value|fake-value/);
    }
  });
});
