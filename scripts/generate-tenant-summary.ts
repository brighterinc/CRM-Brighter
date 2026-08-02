/**
 * CLI de exemplo do Brighter Tenant Engine — Foundation v1.
 *
 * NÃO persiste (não usa `InMemoryTenantRepository`), NÃO provisiona VPS,
 * Supabase, Vercel, DNS ou Docker, NÃO altera `.env`, NÃO lê/grava segredo.
 * Monta um tenant TEMPORÁRIO em memória, gera o manifesto de implantação
 * (`generateDeploymentManifest`, reusado — não reimplementado), anexa via
 * `attachDeploymentManifest`, calcula a prontidão (`evaluateTenantReadiness`)
 * e imprime no terminal (JSON ou Markdown).
 *
 * Uso:
 *   pnpm tenant:summary -- \
 *     --client "Empresa Exemplo" \
 *     --slug empresa-exemplo \
 *     --domain crm.empresa.com.br \
 *     --plan lite \
 *     --modules core.contacts,core.pipeline
 *
 * Opcionais de branding: --app-name · --legal-name · --logo-url ·
 * --favicon-url · --support-email · --website-url · --from-name ·
 * --from-email. Opcionais de tenant: --target vercel|cloudflare|vps ·
 * --commercial-status · --technical-status · --contact-name ·
 * --contact-email · --contact-phone · --contact-role · --am-name ·
 * --am-email · --am-phone · --am-role · --provider · --project-reference ·
 * --external-id · --region · --supabase-project-ref · --supabase-project-url
 * · --supabase-region · --notes · --format json|markdown (default json).
 *
 * Sai com código != 0 quando a prontidão calculada tem blockers (ou quando
 * o manifesto não pôde ser anexado ao tenant).
 */
// Import direto dos submódulos puros (não do barrel `../lib/tenants`): o
// barrel também reexporta `current-installation.ts`, que lê `@/lib/env` —
// puxaria a validação de env vars da instalação (Supabase etc.) pra dentro
// desta CLI, que não precisa e não deveria depender de `.env` nenhum
// (mesma independência que `generate-deployment-manifest.ts` já tem).
import { attachDeploymentManifest } from "../lib/tenants/validation";
import { evaluateTenantReadiness } from "../lib/tenants/readiness";
import type {
  Tenant,
  TenantCommercialStatus,
  TenantContact,
  TenantReadiness,
  TenantTechnicalStatus,
} from "../lib/tenants/types";
import {
  generateDeploymentManifest,
  type DeploymentPlan,
  type DeploymentRequest,
  type DeploymentTarget,
} from "../lib/deployment";

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
      "  pnpm tenant:summary -- --client <nome> --slug <slug> --domain <host> --plan lite|pro|dedicated --modules id1,id2",
      "",
      "Branding: --app-name --legal-name --logo-url --favicon-url --support-email --website-url --from-name --from-email",
      "Tenant:   --target vercel|cloudflare|vps  --commercial-status  --technical-status",
      "          --contact-name --contact-email --contact-phone --contact-role",
      "          --am-name --am-email --am-phone --am-role",
      "          --provider --project-reference --external-id --region",
      "          --supabase-project-ref --supabase-project-url --supabase-region --notes",
      "          --format json|markdown",
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

function renderMarkdown(tenant: Tenant, readiness: TenantReadiness, attachErrors: string[]): string {
  const lines: string[] = [
    `# Resumo de tenant — ${tenant.clientName}`,
    "",
    `- **Slug:** ${tenant.clientSlug}`,
    `- **Domínio:** ${tenant.domain}`,
    `- **Plano:** ${tenant.plan}`,
    `- **Status comercial:** ${tenant.commercialStatus}`,
    `- **Status técnico:** ${tenant.technicalStatus}`,
    `- **Prontidão:** ${readiness.score}/100 — ${readiness.ready ? "pronta" : "com pendências"}`,
    "",
    `## Módulos pedidos (${tenant.requestedModules.length})`,
    ...tenant.requestedModules.map((id) => `- ${id}`),
  ];

  if (attachErrors.length > 0) {
    lines.push("", "## Erro ao anexar manifesto", ...attachErrors.map((e) => `- ${e}`));
  }

  lines.push(
    "",
    "## Bloqueios de prontidão",
    ...(readiness.blockers.length > 0
      ? readiness.blockers.map((b) => `- (${b.category}) ${b.label}`)
      : ["- nenhum"]),
    "",
    "## Avisos",
    ...(readiness.warnings.length > 0
      ? readiness.warnings.map((w) => `- (${w.category}) ${w.label}`)
      : ["- nenhum"]),
    "",
    "## Concluído",
    ...readiness.completed.map((c) => `- (${c.category}) ${c.label}`),
  );

  return lines.join("\n") + "\n";
}

function main(): void {
  const flags = parseArgs(process.argv.slice(2));

  const client = str(flags.client);
  const slug = str(flags.slug);
  const domain = str(flags.domain);
  const plan = str(flags.plan);
  if (!client || !slug || !domain || !plan) usage();

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
    plan: plan as DeploymentPlan,
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
    plan: plan as DeploymentPlan,
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

  const readiness = evaluateTenantReadiness(tenant);

  if (format === "markdown") {
    console.log(renderMarkdown(tenant, readiness, attachErrors));
  } else {
    console.log(JSON.stringify({ tenant, readiness, attachErrors }, null, 2));
  }

  if (readiness.blockers.length > 0 || attachErrors.length > 0) {
    console.error(
      `\n✗ tenant não está pronto — ${readiness.blockers.length} bloqueio(s) de prontidão, ${attachErrors.length} erro(s) ao anexar manifesto.`,
    );
    process.exit(1);
  }
}

main();
