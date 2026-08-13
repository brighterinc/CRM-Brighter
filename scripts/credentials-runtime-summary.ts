/**
 * CLI da Brighter Provider Credentials Runtime — v1.
 *
 * 100% in-memory (`createInMemoryProviderCredentialsRuntimeDeps`) — NÃO
 * cria VPS/Supabase/Vercel/DNS/Docker/Redis/WhatsApp de verdade, NÃO chama
 * rede, NÃO altera `.env` real, NÃO acessa a Lumina. `environment-fake` usa
 * uma env var sintética (`BRIGHTER_RUNTIME_SIMULATION_TOKEN`), setada e
 * restaurada dentro do próprio cenário.
 *
 * Uso:
 *   pnpm credentials:runtime -- --scenario healthy              --format markdown
 *   pnpm credentials:runtime -- --scenario all                  --format json
 *   pnpm credentials:runtime -- --mode summary                  --format markdown   (default)
 *
 * Cenários disponíveis: healthy, missing-reference, revoked-reference,
 * cross-tenant-denied, provider-mismatch, expired, single-use,
 * release-on-error, environment-fake, adapter-requirement, blocked-operation.
 */
import type { ProviderCredentialReadiness } from "../lib/provider-credentials-runtime/control-plane-integration";
import { createInMemoryProviderCredentialsRuntimeDeps } from "../lib/provider-credentials-runtime/factory";
import {
  runAllSimulationScenarios,
  runSimulationScenario,
  simulationScenarioPassed,
  SIMULATION_SCENARIO_NAMES,
  type SimulationScenarioName,
} from "../lib/provider-credentials-runtime/simulation";
import { generateProviderCredentialsRuntimeSummary } from "../lib/provider-credentials-runtime/summary";

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
    [
      "Uso:",
      "  pnpm credentials:runtime -- --scenario <nome>|all --format json|markdown",
      "  pnpm credentials:runtime -- --mode summary --format json|markdown",
      "",
      `Cenários: ${SIMULATION_SCENARIO_NAMES.join(", ")}`,
    ].join("\n"),
  );
  process.exit(1);
}

async function runSummary(format: Format): Promise<void> {
  const { deps } = await createInMemoryProviderCredentialsRuntimeDeps();
  const vaultProviderHealth = await deps.vaultProviderRegistry.healthPreview();

  // Sem installation persistida nesta invocação — readiness fica vazio de
  // propósito (CLI 100% in-memory, sem fixture semeada por padrão). Rode
  // `--scenario healthy` (ou `all`) pra ver leituras de fato.
  const readiness: ProviderCredentialReadiness[] = [];
  const scenarioResults = await runAllSimulationScenarios();

  const summary = generateProviderCredentialsRuntimeSummary(
    {
      vaultProviderHealth,
      readiness,
      overview: { total: 0, ready: 0, missing: 0, blocked: 0 },
      scenarioResults,
      activeLeaseCount: 0,
      deniedAccessCount: scenarioResults.filter((r) => r.outcome === "denied").length,
    },
    format,
  );
  console.log(summary);
}

async function runScenario(name: string, format: Format): Promise<void> {
  if (name === "all") {
    const results = await runAllSimulationScenarios();
    if (format === "json") {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log("# Provider Credentials Runtime — todos os cenários\n");
      for (const result of results) {
        console.log(`## \`${result.scenario}\` — ${result.outcome}\n\n${result.message}\n`);
      }
    }
    const failed = results.filter((r) => !simulationScenarioPassed(r));
    if (failed.length > 0) {
      console.error(`\n✗ ${failed.length} cenário(s) não bateram o outcome esperado: ${failed.map((f) => f.scenario).join(", ")}`);
      process.exitCode = 1;
    }
    return;
  }

  if (!(SIMULATION_SCENARIO_NAMES as readonly string[]).includes(name)) usage();
  const result = await runSimulationScenario(name as SimulationScenarioName);
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`# Cenário \`${result.scenario}\` — ${result.outcome}\n\n${result.message}\n\n\`\`\`json\n${JSON.stringify(result.details, null, 2)}\n\`\`\``);
  }
  if (!simulationScenarioPassed(result)) process.exitCode = 1;
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  const format = (str(flags.format) ?? "markdown") as Format;
  const scenario = str(flags.scenario);
  const mode = str(flags.mode) ?? (scenario ? "scenario" : "summary");

  if (mode === "scenario") {
    if (!scenario) usage();
    await runScenario(scenario, format);
    return;
  }

  await runSummary(format);
}

main().catch((err) => {
  console.error("✗ erro no CLI de provider-credentials-runtime:", err);
  process.exitCode = 1;
});
