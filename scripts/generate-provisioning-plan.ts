/**
 * CLI de exemplo do Brighter Provisioning Engine — Foundation v1.
 *
 * NÃO provisiona VPS, Supabase, Vercel, DNS ou Docker. NÃO altera `.env`.
 * NÃO lê nem grava segredo. Monta um tenant TEMPORÁRIO em memória (mesmo
 * padrão de `scripts/generate-tenant-summary.ts`), gera o manifesto
 * (`generateDeploymentManifest`), anexa (`attachDeploymentManifest`), gera o
 * plano de execução (`generateProvisioningPlan`) e imprime (JSON ou
 * Markdown). Com `--simulate`, também roda `simulateProvisioning` — dry-run
 * determinístico via `InMemoryProvisioningAdapter`, nunca uma ação real.
 *
 * Uso:
 *   pnpm provisioning:plan -- \
 *     --client "Empresa Exemplo" \
 *     --slug empresa-exemplo \
 *     --domain crm.empresa.com.br \
 *     --plan lite \
 *     --modules core.contacts,core.pipeline \
 *     --format markdown
 *
 * Opcionais: --target vercel|cloudflare|vps · --simulate · --fail
 * <stepId1,stepId2> (só com --simulate) · --format json|markdown (default
 * json) · branding: --app-name --legal-name --logo-url --favicon-url
 * --support-email --website-url --from-name --from-email · tenant:
 * --commercial-status --technical-status --contact-name --contact-email
 * --contact-phone --contact-role --am-name --am-email --am-phone --am-role
 * --provider --project-reference --external-id --region
 * --supabase-project-ref --supabase-project-url --supabase-region --notes.
 *
 * Sai com código != 0 quando o plano gerado tem blockers.
 */
import {
  generateDeploymentManifest,
  type DeploymentPlan,
  type DeploymentRequest,
  type DeploymentTarget,
} from "../lib/deployment";
import { attachDeploymentManifest } from "../lib/tenants/validation";
import type { Tenant, TenantCommercialStatus, TenantContact, TenantTechnicalStatus } from "../lib/tenants/types";
import {
  generateProvisioningPlan,
  generateProvisioningSummary,
  renderProvisioningSummaryMarkdown,
  simulateProvisioning,
  type ProvisioningPlan,
} from "../lib/provisioning";

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
      "  pnpm provisioning:plan -- --client <nome> --slug <slug> --domain <host> --plan lite|pro|dedicated --modules id1,id2",
      "",
      "Opcionais: --target vercel|cloudflare|vps  --simulate  --fail <stepId1,stepId2>  --format json|markdown",
      "Branding: --app-name --legal-name --logo-url --favicon-url --support-email --website-url --from-name --from-email",
      "Tenant:   --commercial-status --technical-status",
      "          --contact-name --contact-email --contact-phone --contact-role",
      "          --am-name --am-email --am-phone --am-role",
      "          --provider --project-reference --external-id --region",
      "          --supabase-project-ref --supabase-project-url --supabase-region --notes",
    ].join("\n"),
  );
  process.exit(1);
}

function str(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function buildContact(name?: string, email?: string, phone?: string, role?: string): TenantContact | undefined {
  if (!name || !email) return undefined;
  return { name, email, phone, role };
}

function renderPlanMarkdown(plan: ProvisioningPlan): string {
  const lines: string[] = [
    "## Etapas ordenadas",
    ...plan.steps.map((s, i) => `${i + 1}. [${s.status}] ${s.stepId}`),
  ];
  return lines.join("\n") + "\n";
}

function main(): void {
  const flags = parseArgs(process.argv.slice(2));

  const client = str(flags.client);
  const slug = str(flags.slug);
  const domain = str(flags.domain);
  const planFlag = str(flags.plan);
  if (!client || !slug || !domain || !planFlag) usage();

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
  const simulate = Boolean(flags.simulate);
  const failStepIds = str(flags.fail)
    ?.split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

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

  const provider = str(flags.provider);
  const projectReference = str(flags["project-reference"]);
  const externalId = str(flags["external-id"]);
  const region = str(flags.region);
  const hasInfraRef = Boolean(provider || projectReference || externalId || target);

  const supabaseProjectRef = str(flags["supabase-project-ref"]);
  const supabaseProjectUrl = str(flags["supabase-project-url"]);
  const supabaseRegion = str(flags["supabase-region"]);
  const hasSupabaseRef = Boolean(supabaseProjectRef || supabaseProjectUrl || supabaseRegion);

  const now = new Date().toISOString();
  let tenant: Tenant = {
    id: crypto.randomUUID(),
    clientName: client,
    clientSlug: slug,
    legalName: branding.legalName,
    domain,
    plan: planFlag as DeploymentPlan,
    requestedModules,
    enabledModules: [],
    branding,
    commercialStatus: (str(flags["commercial-status"]) as TenantCommercialStatus | undefined) ?? "lead",
    technicalStatus: (str(flags["technical-status"]) as TenantTechnicalStatus | undefined) ?? "draft",
    primaryContact: buildContact(
      str(flags["contact-name"]),
      str(flags["contact-email"]),
      str(flags["contact-phone"]),
      str(flags["contact-role"]),
    ),
    accountManager: buildContact(
      str(flags["am-name"]),
      str(flags["am-email"]),
      str(flags["am-phone"]),
      str(flags["am-role"]),
    ),
    infrastructure: hasInfraRef
      ? { target: target ?? manifest.target, provider, projectReference, externalId, region }
      : undefined,
    supabase: hasSupabaseRef
      ? { projectRef: supabaseProjectRef, projectUrl: supabaseProjectUrl, region: supabaseRegion }
      : undefined,
    notes: str(flags.notes),
    createdAt: now,
    updatedAt: now,
  };

  const attachErrors: string[] = [];
  const attachResult = attachDeploymentManifest(tenant, manifest);
  if (attachResult.ok) {
    tenant = attachResult.tenant;
  } else {
    attachErrors.push(...attachResult.errors.map((e) => `${e.field}: ${e.message}`));
  }

  const plan = generateProvisioningPlan({ tenant, manifest });
  const summary = generateProvisioningSummary(plan, manifest);

  if (format === "markdown") {
    console.log(renderProvisioningSummaryMarkdown(summary));
    console.log(renderPlanMarkdown(plan));
  } else {
    console.log(JSON.stringify({ plan, summary, attachErrors }, null, 2));
  }

  if (attachErrors.length > 0) {
    console.error("\n✗ manifesto não pôde ser anexado ao tenant — ver attachErrors acima.");
  }

  async function runSimulationIfRequested(): Promise<void> {
    if (!simulate) return;
    const { plan: simulated, logs } = await simulateProvisioning(plan, { failStepIds });
    if (format === "markdown") {
      console.log("\n--- Simulação (dry-run) ---\n");
      console.log(renderPlanMarkdown(simulated));
      console.log(`Status final da simulação: ${simulated.status}`);
      console.log(`Eventos de log: ${logs.length}`);
    } else {
      console.log(JSON.stringify({ simulation: { plan: simulated, logs } }, null, 2));
    }
  }

  runSimulationIfRequested()
    .catch((err) => {
      console.error("✗ erro ao simular:", err);
      process.exitCode = 1;
    })
    .finally(() => {
      if (plan.blockers.length > 0 || attachErrors.length > 0) {
        console.error(
          `\n✗ plano de provisionamento tem bloqueio(s) — ${plan.blockers.length} bloqueio(s), ${attachErrors.length} erro(s) de anexação de manifesto.`,
        );
        process.exitCode = 1;
      }
    });
}

main();
