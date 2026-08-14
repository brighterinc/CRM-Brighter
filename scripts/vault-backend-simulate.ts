/**
 * CLI do Real Vault Backend — `pnpm vault:simulate`.
 *
 * 100% in-memory/fake (`FakeSecretEncryptionProvider`, `InMemorySecretPayloadRepository`,
 * `createInMemoryProviderCredentialsRuntimeDeps`) — NÃO toca Postgres/pgcrypto
 * real, NÃO chama rede, NÃO altera `.env`, NÃO acessa a Lumina. Valores de
 * segredo usados são sempre sintéticos e obviamente fake.
 *
 * Uso:
 *   pnpm vault:simulate -- --scenario healthy    --format markdown
 *   pnpm vault:simulate -- --scenario all         --format json
 *
 * Cenários: healthy, cross-tenant, wrong-provider, wrong-purpose,
 * wrong-secret-type, rotate, revoked, corrupted, missing, concurrent-rotation.
 */
import {
  runAllVaultBackendSimulationScenarios,
  runVaultBackendSimulationScenario,
  vaultBackendSimulationPassed,
  VAULT_BACKEND_SIMULATION_SCENARIO_NAMES,
  type VaultBackendSimulationScenarioName,
} from "../lib/control-plane-persistence/vault/simulation";

type Flags = Record<string, string | boolean>;
type Format = "json" | "markdown";

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return flags;
}

function str(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function usage(): never {
  console.error(
    ["Uso:", "  pnpm vault:simulate -- --scenario <nome>|all --format json|markdown", "", `Cenários: ${VAULT_BACKEND_SIMULATION_SCENARIO_NAMES.join(", ")}`].join("\n"),
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  const format = (str(flags.format) ?? "markdown") as Format;
  const scenario = str(flags.scenario) ?? "all";

  if (scenario === "all") {
    const results = await runAllVaultBackendSimulationScenarios();
    if (format === "json") {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log("# Real Vault Backend — todos os cenários\n");
      for (const result of results) {
        console.log(`## \`${result.scenario}\` — ${result.outcome}\n\n${result.message}\n`);
      }
    }
    const failed = results.filter((r) => !vaultBackendSimulationPassed(r));
    if (failed.length > 0) {
      console.error(`\n✗ ${failed.length} cenário(s) não bateram o outcome esperado: ${failed.map((f) => f.scenario).join(", ")}`);
      process.exitCode = 1;
    }
    return;
  }

  if (!(VAULT_BACKEND_SIMULATION_SCENARIO_NAMES as readonly string[]).includes(scenario)) usage();
  const result = await runVaultBackendSimulationScenario(scenario as VaultBackendSimulationScenarioName);
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`# Cenário \`${result.scenario}\` — ${result.outcome}\n\n${result.message}\n\n\`\`\`json\n${JSON.stringify(result.details, null, 2)}\n\`\`\``);
  }
  if (!vaultBackendSimulationPassed(result)) process.exitCode = 1;
}

main().catch((err) => {
  console.error("✗ erro no CLI de vault-backend:", err);
  process.exitCode = 1;
});
