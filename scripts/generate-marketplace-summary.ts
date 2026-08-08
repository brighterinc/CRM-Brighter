/**
 * CLI de exemplo da Brighter Marketplace / Module Licensing Foundation — v1.
 *
 * NÃO ativa módulo real, NÃO cobra, NÃO chama rede, NÃO altera `.env` e NÃO
 * acessa a Lumina. Monta um tenant TEMPORÁRIO em memória (mesmo padrão de
 * `scripts/generate-outreach-summary.ts`), gera o manifesto
 * (`generateDeploymentManifest`), anexa (`attachDeploymentManifest`) e monta
 * a `Installation` via `InMemoryInstallationRepository.createInstallation`
 * antes de rodar `simulateMarketplaceScenario` — dry-run determinístico,
 * nunca ativação real.
 *
 * Uso:
 *   pnpm marketplace:summary -- \
 *     --client "Empresa Exemplo" \
 *     --slug empresa-exemplo \
 *     --domain crm.empresa.com.br \
 *     --plan dedicated \
 *     --modules core.contacts,channel.whatsapp,ai.agents \
 *     --scenario paid-addon \
 *     --format markdown
 *
 * Cenários aceitos: included-module · paid-addon · active-license ·
 * suspended-license · expired-license · cancelled-license · active-trial ·
 * expired-trial · trial-converted · incompatible-plan · missing-dependency ·
 * conflicting-module · module-planned · module-deprecated · module-retired ·
 * module-disabled · billing-denied · billing-active · private-offer ·
 * bundle-valid · bundle-conflict · version-upgrade · version-downgrade ·
 * grace-period · activation-ready · activation-blocked
 *
 * Opcionais: --target vercel|cloudflare|vps · --format json|markdown
 * (default json) · branding: --app-name --legal-name --logo-url
 * --favicon-url --support-email --website-url --from-name --from-email.
 *
 * Sai com código != 0 quando o cenário invocado é um dos "cenários críticos
 * documentados" (`CRITICAL_SCENARIOS` abaixo) E a simulação de fato reportou
 * blocker — mesma regra de `generate-outreach-summary.ts`.
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
import {
  generateMarketplaceSummary,
  MARKETPLACE_SIMULATION_SCENARIOS,
  renderMarketplaceSummaryMarkdown,
  simulateMarketplaceScenario,
  type MarketplaceSimulationScenario,
} from "../lib/marketplace";

type Flags = Record<string, string | boolean>;

const CRITICAL_SCENARIOS = new Set<MarketplaceSimulationScenario>([
  "suspended-license",
  "expired-license",
  "cancelled-license",
  "expired-trial",
  "incompatible-plan",
  "missing-dependency",
  "conflicting-module",
  "module-planned",
  "module-retired",
  "module-disabled",
  "billing-denied",
  "private-offer",
  "bundle-conflict",
  "activation-blocked",
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
      "  pnpm marketplace:summary -- --client <nome> --slug <slug> --domain <host> --plan lite|pro|dedicated --modules id1,id2 --scenario included-module",
      "",
      `Cenários aceitos: ${MARKETPLACE_SIMULATION_SCENARIOS.join(" · ")}`,
      "Opcionais: --target vercel|cloudflare|vps  --format json|markdown",
      "Branding: --app-name --legal-name --logo-url --favicon-url --support-email --website-url --from-name --from-email",
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

  const scenarioFlag = (str(flags.scenario) ?? "included-module") as MarketplaceSimulationScenario;
  if (!MARKETPLACE_SIMULATION_SCENARIOS.includes(scenarioFlag)) usage();

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

  const branding = {
    appName: str(flags["app-name"]) ?? client,
    legalName: str(flags["legal-name"]),
    logoUrl: str(flags["logo-url"]),
    faviconUrl: str(flags["favicon-url"]),
    supportEmail: str(flags["support-email"]),
    websiteUrl: str(flags["website-url"]),
    fromName: str(flags["from-name"]),
    fromEmail: str(flags["from-email"]),
  };

  const request: DeploymentRequest = {
    clientName: client,
    clientSlug: slug,
    domain,
    plan: planFlag as DeploymentPlan,
    requestedModules,
    target,
    branding,
  };

  const manifest = generateDeploymentManifest(request);

  const now = new Date().toISOString();
  let tenant: Tenant = {
    id: crypto.randomUUID(),
    clientName: client,
    clientSlug: slug,
    legalName: branding.legalName,
    domain,
    plan: planFlag as DeploymentPlan,
    requestedModules,
    enabledModules: manifest.enabledModules,
    branding,
    commercialStatus: "active",
    technicalStatus: "live",
    createdAt: now,
    updatedAt: now,
  };

  const attachResult = attachDeploymentManifest(tenant, manifest);
  if (attachResult.ok) {
    tenant = attachResult.tenant;
  } else {
    const attachErrors = attachResult.errors.map((e) => `${e.field}: ${e.message}`);
    console.error("✗ manifesto não pôde ser anexado ao tenant:", attachErrors.join("; "));
    process.exit(1);
  }

  const repository = new InMemoryInstallationRepository();
  const installation = await repository.createInstallation({
    slug,
    company: client,
    status: "active",
    commercial: "production",
    technical: "running",
    tenant,
  });

  const result = simulateMarketplaceScenario(scenarioFlag, { installation });

  const summary = generateMarketplaceSummary({
    installation,
    catalog: result.catalog,
    licenses: result.license ? [result.license] : [],
    trials: result.trial ? [result.trial] : [],
    entitlements: result.entitlements,
    bundles: result.bundle ? [result.bundle] : [],
    extraBlockers: result.blockers,
    extraWarnings: result.warnings,
  });

  if (format === "markdown") {
    console.log(renderMarketplaceSummaryMarkdown(summary));
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
  console.error("✗ erro ao gerar resumo do marketplace:", err);
  process.exitCode = 1;
});
