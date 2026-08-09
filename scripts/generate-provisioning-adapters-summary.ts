/**
 * CLI de exemplo da Brighter Provisioning Adapters Foundation — v1.
 *
 * NÃO cria VPS/Supabase/Vercel/DNS/Docker/Redis/Evolution/WAHA/Chatwoot de
 * verdade, NÃO chama rede, NÃO altera `.env` real e NÃO acessa a Lumina.
 * `simulateProvisioningAdapterScenario` monta uma `Installation` de
 * demonstração (`createDemoInstallations`, `lib/control-plane/repository.ts`)
 * e roda dry-run — nunca ativação/provisionamento real. Mesmo padrão de
 * `scripts/generate-marketplace-summary.ts`.
 *
 * Uso:
 *   pnpm provisioning:adapters -- --scenario dedicated-healthy --format markdown
 *
 * Cenários aceitos: lite-healthy · pro-healthy · dedicated-healthy ·
 * missing-adapter · capability-missing · invalid-request ·
 * dependency-failure · supabase-ready · vercel-ready · dns-ready ·
 * vps-ready · docker-ready · redis-ready · whatsapp-ready · chatwoot-ready ·
 * evolution-ready · waha-ready · rollback-preview · idempotent-repeat ·
 * blocker · partial · failed-step
 *
 * Opcionais: --format json|markdown (default json).
 *
 * Sai com código != 0 quando o cenário invocado é um dos "cenários críticos
 * documentados" (`CRITICAL_SCENARIOS` abaixo) E a simulação de fato reportou
 * blocker — mesma regra de `generate-marketplace-summary.ts`.
 */
import {
  generateProvisioningAdapterSummary,
  PROVISIONING_ADAPTER_SIMULATION_SCENARIOS,
  renderProvisioningAdapterSummaryMarkdown,
  simulateProvisioningAdapterScenario,
  type ProvisioningAdapterSimulationScenario,
} from "../lib/provisioning-adapters";

type Flags = Record<string, string | boolean>;

const CRITICAL_SCENARIOS = new Set<ProvisioningAdapterSimulationScenario>([
  "missing-adapter",
  "capability-missing",
  "invalid-request",
  "dependency-failure",
  "blocker",
  "partial",
  "failed-step",
]);

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

function usage(): never {
  console.error(
    [
      "Uso:",
      "  pnpm provisioning:adapters -- --scenario dedicated-healthy --format markdown",
      "",
      `Cenários aceitos: ${PROVISIONING_ADAPTER_SIMULATION_SCENARIOS.join(" · ")}`,
      "Opcionais: --format json|markdown (default json)",
    ].join("\n"),
  );
  process.exit(1);
}

function str(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  const scenarioFlag = (str(flags.scenario) ?? "dedicated-healthy") as ProvisioningAdapterSimulationScenario;
  if (!PROVISIONING_ADAPTER_SIMULATION_SCENARIOS.includes(scenarioFlag)) usage();

  const format = (str(flags.format) ?? "json") as "json" | "markdown";

  const result = await simulateProvisioningAdapterScenario(scenarioFlag);
  const summary = generateProvisioningAdapterSummary(result);

  if (format === "markdown") {
    console.log(renderProvisioningAdapterSummaryMarkdown(summary));
  } else {
    console.log(JSON.stringify({ scenario: scenarioFlag, result, summary }, null, 2));
  }

  const isCriticalScenarioBlocked = CRITICAL_SCENARIOS.has(scenarioFlag) && result.blockers.length > 0;
  if (isCriticalScenarioBlocked) {
    console.error(`\n✗ cenário crítico "${scenarioFlag}" reportou blocker — ver detalhes acima.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("✗ erro ao gerar resumo de adapters de provisionamento:", err);
  process.exitCode = 1;
});
