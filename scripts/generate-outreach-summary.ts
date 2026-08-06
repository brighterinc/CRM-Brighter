/**
 * CLI de exemplo da Brighter Outreach & AI Cadence Engine — Foundation v1.
 *
 * NÃO envia mensagem real, NÃO chama IA externa, NÃO chama rede, NÃO agenda
 * nada de verdade (sem setTimeout/cron/worker/fila real), NÃO altera `.env`
 * e NÃO acessa a Lumina. Monta um tenant TEMPORÁRIO em memória (mesmo
 * padrão de `scripts/generate-automation-summary.ts`), gera o manifesto
 * (`generateDeploymentManifest`), anexa (`attachDeploymentManifest`) e monta
 * a `Installation` via `InMemoryInstallationRepository.createInstallation`
 * (reusa a MESMA derivação que a tela admin já usa) antes de rodar
 * `simulateOutreachScenario` — dry-run determinístico, nunca envio real.
 *
 * Uso:
 *   pnpm outreach:summary -- \
 *     --client "Empresa Exemplo" \
 *     --slug empresa-exemplo \
 *     --domain crm.empresa.com.br \
 *     --plan dedicated \
 *     --modules core.contacts,channel.whatsapp,automation.campaigns,ai.agents \
 *     --scenario healthy \
 *     --format markdown
 *
 * Cenários aceitos: healthy · scheduled · active · completed · paused ·
 * cancelled · audience_empty · contact_opted_out · contact_blocked ·
 * duplicate_enrollment · throttled · outside_window · reply_interested ·
 * reply_objection · reply_opt_out · reply_unknown · human_handoff ·
 * ai_low_confidence · channel_unavailable · billing_limit ·
 * module_disabled · template_missing_variable · retry_success ·
 * retry_exhausted
 *
 * Opcionais: --target vercel|cloudflare|vps · --format json|markdown
 * (default json) · branding: --app-name --legal-name --logo-url
 * --favicon-url --support-email --website-url --from-name --from-email.
 *
 * Sai com código != 0 quando o cenário invocado é um dos "cenários críticos
 * documentados" (`CRITICAL_SCENARIOS` abaixo — throttling, fora da janela,
 * opt-out, canal indisponível, limite de billing, módulo desabilitado,
 * template com variável faltando, retry esgotado, contato bloqueado,
 * enrollment duplicado) E a simulação de fato reportou blocker. O blocker
 * "automation.campaigns não autorizado" está SEMPRE presente (o módulo é
 * `status: "planned"` — nunca autorizado em produção nesta Foundation) e
 * por isso NUNCA, sozinho, decide o exit code — senão todo cenário sairia
 * != 0, mascarando o sinal real.
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
  generateOutreachSummary,
  OUTREACH_SIMULATION_SCENARIOS,
  renderOutreachSummaryMarkdown,
  simulateOutreachScenario,
  type OutreachSimulationScenario,
} from "../lib/outreach";

type Flags = Record<string, string | boolean>;

const CRITICAL_SCENARIOS = new Set<OutreachSimulationScenario>([
  "contact_opted_out",
  "contact_blocked",
  "duplicate_enrollment",
  "throttled",
  "outside_window",
  "channel_unavailable",
  "billing_limit",
  "module_disabled",
  "template_missing_variable",
  "retry_exhausted",
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
      "  pnpm outreach:summary -- --client <nome> --slug <slug> --domain <host> --plan lite|pro|dedicated --modules id1,id2 --scenario healthy",
      "",
      `Cenários aceitos: ${OUTREACH_SIMULATION_SCENARIOS.join(" · ")}`,
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

  const scenarioFlag = (str(flags.scenario) ?? "healthy") as OutreachSimulationScenario;
  if (!OUTREACH_SIMULATION_SCENARIOS.includes(scenarioFlag)) usage();

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
    // `requestedModules` cru, senão um módulo bloqueado por plano pareceria "ativo" pro Outreach.
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

  const result = await simulateOutreachScenario(scenarioFlag, { installation });

  const summary = generateOutreachSummary({
    installation,
    campaigns: [result.campaign],
    cadences: [result.cadence],
    enrollments: result.enrollments,
    metrics: result.metrics,
    extraBlockers: result.blockers,
    extraWarnings: result.warnings,
  });

  if (format === "markdown") {
    console.log(renderOutreachSummaryMarkdown(summary));
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
  console.error("✗ erro ao gerar resumo de outreach:", err);
  process.exitCode = 1;
});
