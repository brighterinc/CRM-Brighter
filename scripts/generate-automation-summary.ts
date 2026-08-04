/**
 * CLI de exemplo do Brighter Automation Engine — Foundation v1.
 *
 * NÃO executa ação real, NÃO chama rede, NÃO agenda nada de verdade (sem
 * setTimeout/cron/worker/fila real), NÃO altera `.env` e NÃO acessa a
 * Lumina. Monta um tenant TEMPORÁRIO em memória (mesmo padrão de
 * `scripts/generate-monitoring-summary.ts`), gera o manifesto
 * (`generateDeploymentManifest`), anexa (`attachDeploymentManifest`) e monta
 * a `Installation` via `InMemoryInstallationRepository.createInstallation`
 * (`lib/control-plane/repository.ts` — reusa a MESMA derivação que a tela
 * admin/Control Plane já usa, nunca reimplementada aqui) antes de rodar
 * `simulateWorkflowRun` — dry-run determinístico, nunca uma ação real.
 *
 * Uso:
 *   pnpm automation:summary -- \
 *     --client "Empresa Exemplo" \
 *     --slug empresa-exemplo \
 *     --domain crm.empresa.com.br \
 *     --plan dedicated \
 *     --modules core.contacts,core.pipeline,channel.whatsapp,automation.webhooks \
 *     --scenario all_success \
 *     --format markdown
 *
 * Cenários aceitos: all_success · webhook_retry_then_success ·
 * webhook_retry_exhausted_fallback · fallback_action_also_fails ·
 * duplicate_trigger_idempotent_skip · delayed_step_waiting ·
 * workflow_inactive · module_not_authorized
 *
 * Opcionais: --target vercel|cloudflare|vps · --format json|markdown
 * (default json) · branding: --app-name --legal-name --logo-url
 * --favicon-url --support-email --website-url --from-name --from-email.
 *
 * Sai com código != 0 quando o run resultante termina `"failed"`.
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
  AUTOMATION_SIMULATION_SCENARIOS,
  createDemoWorkflows,
  generateAutomationSummary,
  renderAutomationSummaryMarkdown,
  simulateWorkflowRun,
  type AutomationSimulationScenario,
} from "../lib/automation-engine";

type Flags = Record<string, string | boolean>;

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
      "  pnpm automation:summary -- --client <nome> --slug <slug> --domain <host> --plan lite|pro|dedicated --modules id1,id2 --scenario all_success",
      "",
      `Cenários aceitos: ${AUTOMATION_SIMULATION_SCENARIOS.join(" · ")}`,
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

  const scenarioFlag = (str(flags.scenario) ?? "all_success") as AutomationSimulationScenario;
  if (!AUTOMATION_SIMULATION_SCENARIOS.includes(scenarioFlag)) usage();

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
    // `requestedModules` cru, senão um módulo bloqueado por plano pareceria "ativo" pra Automação.
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

  const workflows = createDemoWorkflows([installation]);
  if (workflows.length === 0) {
    console.error(
      `✗ instalação "${slug}" não tem "automation.webhooks" habilitado — nenhum workflow de demonstração disponível. Inclua "automation.webhooks" em --modules.`,
    );
    process.exit(1);
  }

  const runs = [];
  let anyFailed = false;
  for (const workflow of workflows) {
    const result = await simulateWorkflowRun(scenarioFlag, { installation, workflow });
    runs.push(result.run);
    if (result.run.status === "failed") anyFailed = true;
  }

  const summary = generateAutomationSummary(installation, workflows, runs);

  if (format === "markdown") {
    console.log(renderAutomationSummaryMarkdown(summary));
  } else {
    console.log(JSON.stringify({ runs, summary }, null, 2));
  }

  if (anyFailed) {
    console.error(`\n✗ cenário "${scenarioFlag}" terminou com pelo menos um run "failed" — ver histórico acima.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("✗ erro ao gerar resumo de automação:", err);
  process.exitCode = 1;
});
