/**
 * CLI de exemplo do Brighter Billing Engine — Foundation v1.
 *
 * NÃO cobra ninguém, NÃO chama rede, NÃO integra InfinitePay/Stripe/Mercado
 * Pago/banco, NÃO gera boleto/Pix/nota fiscal, NÃO altera `.env` e NÃO
 * acessa a Lumina. Monta um tenant TEMPORÁRIO em memória (mesmo padrão de
 * `scripts/generate-monitoring-summary.ts`), monta a `Installation` via
 * `InMemoryInstallationRepository.createInstallation` (reusa a MESMA
 * derivação da Control Plane) e roda `simulateBillingScenario` — dry-run
 * determinístico, nunca uma ação real.
 *
 * Uso:
 *   pnpm billing:summary -- \
 *     --client "Empresa Exemplo" \
 *     --slug empresa-exemplo \
 *     --domain crm.empresa.com.br \
 *     --plan pro \
 *     --modules core.contacts,core.pipeline,channel.email \
 *     --scenario active \
 *     --format markdown
 *
 * Cenários aceitos (flag `--scenario`, mapeados internamente pro cenário
 * determinístico de `lib/billing/simulation.ts`):
 *   active · trial · past-due · grace-period · suspended · cancelled ·
 *   upgrade · downgrade · usage-warning · usage-exceeded · payment-failed
 *
 * `upgrade` usa lite→pro (ou pro→dedicated se `--plan pro`); `downgrade`
 * usa dedicated→pro e por isso exige `--plan dedicated`.
 *
 * Opcionais: --target vercel|cloudflare|vps · --format json|markdown
 * (default json).
 *
 * Sai com código != 0 apenas nos cenários explicitamente críticos
 * documentados: `suspended` e `cancelled` (assinatura termina num estado
 * que exige ação humana) — nunca por acaso.
 */
import {
  generateDeploymentManifest,
  type DeploymentPlan,
  type DeploymentRequest,
  type DeploymentTarget,
} from "../lib/deployment";
import { attachDeploymentManifest } from "../lib/tenants/validation";
import type { Tenant } from "../lib/tenants/types";
import { InMemoryInstallationRepository } from "../lib/control-plane/repository";
import { renderBillingSummaryMarkdown, simulateBillingScenario, type BillingScenario } from "../lib/billing";

type Flags = Record<string, string | boolean>;

const CLI_SCENARIOS = [
  "active",
  "trial",
  "past-due",
  "grace-period",
  "suspended",
  "cancelled",
  "upgrade",
  "downgrade",
  "usage-warning",
  "usage-exceeded",
  "payment-failed",
] as const;
type CliScenario = (typeof CLI_SCENARIOS)[number];

/** Cenário crítico o bastante pra CLI sair com código != 0 — só os dois documentados. */
const CRITICAL_CLI_SCENARIOS: CliScenario[] = ["suspended", "cancelled"];

function mapCliScenario(cliScenario: CliScenario, plan: DeploymentPlan): BillingScenario {
  switch (cliScenario) {
    case "active":
      return plan === "lite" ? "lite-active" : plan === "pro" ? "pro-active" : "dedicated-active";
    case "trial":
      return "trial";
    case "past-due":
      return "payment-failed";
    case "grace-period":
      return "grace-period";
    case "suspended":
      return "suspension-recommended";
    case "cancelled":
      return "cancel-immediate";
    case "upgrade":
      return plan === "pro" ? "upgrade-pro-to-dedicated" : "upgrade-lite-to-pro";
    case "downgrade":
      return "downgrade-dedicated-to-pro";
    case "usage-warning":
      return "usage-warning";
    case "usage-exceeded":
      return "usage-exceeded";
    case "payment-failed":
      return "payment-failed";
    default: {
      const exhaustive: never = cliScenario;
      throw new Error(`cenário desconhecido: ${exhaustive}`);
    }
  }
}

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
      "  pnpm billing:summary -- --client <nome> --slug <slug> --domain <host> --plan lite|pro|dedicated --modules id1,id2 --scenario active",
      "",
      `Cenários aceitos: ${CLI_SCENARIOS.join(" · ")}`,
      "Opcionais: --target vercel|cloudflare|vps  --format json|markdown",
      "'downgrade' exige --plan dedicated (dedicated → pro).",
    ].join("\n"),
  );
  process.exit(1);
}

function str(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  const client = str(flags.client);
  const slug = str(flags.slug);
  const domain = str(flags.domain);
  const planFlag = str(flags.plan);
  if (!client || !slug || !domain || !planFlag) usage();

  const scenarioFlag = (str(flags.scenario) ?? "active") as CliScenario;
  if (!(CLI_SCENARIOS as readonly string[]).includes(scenarioFlag)) usage();
  if (scenarioFlag === "downgrade" && planFlag !== "dedicated") {
    console.error("✗ --scenario downgrade exige --plan dedicated (simula dedicated → pro).");
    process.exit(1);
  }

  const modulesRaw = str(flags.modules) ?? "";
  const requestedModules = Array.from(
    new Set(
      modulesRaw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  );
  const target = str(flags.target) as DeploymentTarget | undefined;
  const format = (str(flags.format) ?? "json") as "json" | "markdown";

  const request: DeploymentRequest = {
    clientName: client,
    clientSlug: slug,
    domain,
    plan: planFlag as DeploymentPlan,
    requestedModules,
    target,
    branding: { appName: client },
  };

  const manifest = generateDeploymentManifest(request);

  const now = new Date().toISOString();
  let tenant: Tenant = {
    id: crypto.randomUUID(),
    clientName: client,
    clientSlug: slug,
    domain,
    plan: planFlag as DeploymentPlan,
    requestedModules,
    enabledModules: manifest.enabledModules,
    branding: { appName: client },
    commercialStatus: "active",
    technicalStatus: "live",
    createdAt: now,
    updatedAt: now,
  };

  const attachResult = attachDeploymentManifest(tenant, manifest);
  if (!attachResult.ok) {
    console.error("✗ manifesto não pôde ser anexado ao tenant:", attachResult.errors.map((e) => `${e.field}: ${e.message}`).join("; "));
    process.exit(1);
  }
  tenant = attachResult.tenant;

  const repository = new InMemoryInstallationRepository();
  const installation = await repository.createInstallation({
    slug,
    company: client,
    status: "active",
    commercial: "production",
    technical: "running",
    tenant,
  });

  const internalScenario = mapCliScenario(scenarioFlag, installation.deploymentPlan);
  const result = simulateBillingScenario(installation, internalScenario, now);

  if (format === "markdown") {
    console.log(renderBillingSummaryMarkdown(result.summary));
  } else {
    console.log(JSON.stringify({ scenario: scenarioFlag, subscription: result.subscription, invoice: result.invoice, usage: result.usage, credit: result.credit, events: result.events, summary: result.summary }, null, 2));
  }

  if (CRITICAL_CLI_SCENARIOS.includes(scenarioFlag)) {
    console.error(`\n✗ instalação "${slug}" está em cenário crítico ("${scenarioFlag}") — ver recomendação financeira acima.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("✗ erro ao gerar resumo de billing:", err);
  process.exitCode = 1;
});
