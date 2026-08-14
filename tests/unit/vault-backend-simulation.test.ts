import { describe, expect, it } from "vitest";

import {
  runAllVaultBackendSimulationScenarios,
  vaultBackendSimulationPassed,
  VAULT_BACKEND_SIMULATION_SCENARIO_NAMES,
} from "@/lib/control-plane-persistence/vault/simulation";

describe("Real Vault Backend — simulação (todos os 10 cenários pedidos)", () => {
  it("cada cenário nomeado bate o outcome esperado", async () => {
    const results = await runAllVaultBackendSimulationScenarios();
    expect(results).toHaveLength(VAULT_BACKEND_SIMULATION_SCENARIO_NAMES.length);

    const failed = results.filter((r) => !vaultBackendSimulationPassed(r));
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  });

  it("nenhum resultado de simulação carrega plaintext/ciphertext em qualquer campo", async () => {
    const results = await runAllVaultBackendSimulationScenarios();
    const serialized = JSON.stringify(results);
    expect(serialized).not.toMatch(/valor-simulado-nunca-real|segredo-tenant-a|valor-v1|valor-v2|valor-integro|valor-concorrente/);
  });

  it("cobre todos os 10 cenários pedidos pela tarefa", () => {
    expect([...VAULT_BACKEND_SIMULATION_SCENARIO_NAMES].sort()).toEqual(
      ["healthy", "cross-tenant", "wrong-provider", "wrong-purpose", "wrong-secret-type", "rotate", "revoked", "corrupted", "missing", "concurrent-rotation"].sort(),
    );
  });
});
