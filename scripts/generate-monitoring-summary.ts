/**
 * CLI de exemplo do Brighter Monitoring Engine — Foundation v1.
 *
 * NÃO executa check real, NÃO chama rede, NÃO consulta DNS/SSL/Supabase/
 * Vercel/VPS/Docker/Redis/WAHA/Chatwoot/Evolution, NÃO altera `.env` e NÃO
 * acessa a Lumina. Monta um tenant TEMPORÁRIO em memória (mesmo padrão de
 * `scripts/generate-provisioning-plan.ts`), gera o manifesto
 * (`generateDeploymentManifest`), anexa (`attachDeploymentManifest`) e monta
 * a `Installation` via `InMemoryInstallationRepository.createInstallation`
 * (`lib/control-plane/repository.ts` — reusa a MESMA derivação que a tela
 * admin/Control Plane já usa, nunca reimplementada aqui) antes de rodar
 * `simulateMonitoringRun` — dry-run determinístico, nunca uma ação real.
 *
 * Uso:
 *   pnpm monitoring:summary -- \
 *     --client "Empresa Exemplo" \
 *     --slug empresa-exemplo \
 *     --domain crm.empresa.com.br \
 *     --plan dedicated \
 *     --modules core.contacts,core.pipeline,channel.whatsapp \
 *     --scenario healthy \
 *     --format markdown
 *
 * Cenários aceitos: healthy · degraded · critical · ssl-expiring ·
 * dns-failure · database-failure · redis-failure · worker-down ·
 * whatsapp-down · backup-stale
 *
 * Opcionais: --target vercel|cloudflare|vps · --format json|markdown
 * (default json) · branding: --app-name --legal-name --logo-url
 * --favicon-url --support-email --website-url --from-name --from-email.
 *
 * Sai com código != 0 quando `--scenario critical` ou quando o snapshot
 * resultante tem `overallHealth === "unhealthy"`.
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
  generateMonitoringSummary,
  renderMonitoringSummaryMarkdown,
  simulateMonitoringRun,
  type MonitoringScenario,
} from "../lib/monitoring";

type Flags = Record<string, string | boolean>;

const CLI_SCENARIOS: MonitoringScenario[] = [
  "healthy",
  "degraded",
  "critical",
  "ssl-expiring",
  "dns-failure",
  "database-failure",
  "redis-failure",
  "worker-down",
  "whatsapp-down",
  "backup-stale",
];

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
      "  pnpm monitoring:summary -- --client <nome> --slug <slug> --domain <host> --plan lite|pro|dedicated --modules id1,id2 --scenario healthy",
      "",
      `Cenários aceitos: ${CLI_SCENARIOS.join(" · ")}`,
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

  const scenarioFlag = (str(flags.scenario) ?? "healthy") as MonitoringScenario;
  if (!CLI_SCENARIOS.includes(scenarioFlag)) usage();

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
    // Sempre o conjunto já resolvido pelo Module Engine (`manifest.enabledModules`) — nunca
    // `requestedModules` cru, senão um módulo bloqueado por plano pareceria "ativo" pro Monitoring.
    enabledModules: manifest.enabledModules,
    branding,
    commercialStatus: "active",
    technicalStatus: "live",
    createdAt: now,
    updatedAt: now,
  };

  const attachErrors: string[] = [];
  const attachResult = attachDeploymentManifest(tenant, manifest);
  if (attachResult.ok) {
    tenant = attachResult.tenant;
  } else {
    attachErrors.push(...attachResult.errors.map((e) => `${e.field}: ${e.message}`));
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

  const snapshot = simulateMonitoringRun(installation, scenarioFlag);
  const summary = generateMonitoringSummary(installation, snapshot);

  if (format === "markdown") {
    console.log(renderMonitoringSummaryMarkdown(summary));
  } else {
    console.log(JSON.stringify({ snapshot, summary }, null, 2));
  }

  if (scenarioFlag === "critical" || snapshot.overallHealth === "unhealthy") {
    console.error(`\n✗ instalação "${slug}" está "${snapshot.overallHealth}" — ver blockers acima.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("✗ erro ao gerar resumo de monitoramento:", err);
  process.exitCode = 1;
});
