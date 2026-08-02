/**
 * CLI de exemplo do Brighter Deployment Engine — Foundation v1.
 *
 * NÃO provisiona VPS, Supabase, Vercel, DNS ou Docker. NÃO altera `.env`.
 * NÃO grava segredo. Só resolve uma configuração comercial de cliente em
 * manifesto técnico e imprime no terminal (JSON ou Markdown).
 *
 * Uso:
 *   pnpm deployment:manifest -- \
 *     --client "Empresa Exemplo" \
 *     --slug empresa-exemplo \
 *     --domain crm.empresa.com.br \
 *     --plan lite \
 *     --modules core.contacts,core.pipeline
 *
 * Opcionais: --target vercel|cloudflare|vps · --format json|markdown (default
 * json) · --env-template (também imprime um .env de exemplo, sem segredos) ·
 * --app-name · --legal-name · --logo-url · --favicon-url · --support-email ·
 * --website-url · --from-name · --from-email.
 *
 * Sai com código != 0 quando o manifesto gerado tem blockers.
 */
import {
  generateDeploymentManifest,
  renderEnvTemplate,
  type ChecklistItem,
  type DeploymentManifest,
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
      "  pnpm deployment:manifest -- --client <nome> --slug <slug> --domain <host> --plan lite|pro|dedicated --modules id1,id2",
      "",
      "Opcionais: --target vercel|cloudflare|vps  --format json|markdown  --env-template",
      "           --app-name  --legal-name  --logo-url  --favicon-url  --support-email  --website-url  --from-name  --from-email",
    ].join("\n"),
  );
  process.exit(1);
}

function str(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function renderChecklistLine(item: ChecklistItem): string {
  return `- [ ] (${item.category}${item.required ? ", obrigatório" : ""}) ${item.label}`;
}

function renderMarkdown(manifest: DeploymentManifest): string {
  const lines: string[] = [
    `# Manifesto de implantação — ${manifest.client.name}`,
    "",
    `- **Slug:** ${manifest.client.slug}`,
    `- **Domínio:** ${manifest.client.domain}`,
    `- **Plano:** ${manifest.plan}`,
    `- **Target:** ${manifest.target}`,
    `- **Válido:** ${manifest.valid ? "sim" : "NÃO — ver Bloqueios"}`,
    "",
    `## Módulos habilitados (${manifest.enabledModules.length})`,
    ...manifest.enabledModules.map((id) => `- ${id}`),
  ];

  if (manifest.rejectedModules.length > 0) {
    lines.push("", "## Módulos rejeitados");
    lines.push(...manifest.rejectedModules.map((r) => `- ${r.moduleId}: ${r.reason}`));
  }

  lines.push(
    "",
    "## Infraestrutura",
    `- VPS: ${manifest.infrastructure.vpsRequired ? "obrigatória" : "não obrigatória"}`,
    `- Docker: ${manifest.infrastructure.docker ? "obrigatório" : "não usado"}`,
    `- Proxy/SSL: ${manifest.infrastructure.proxy ? "obrigatório" : "não usado"}`,
    "",
    "## Variáveis obrigatórias (só nomes)",
    ...manifest.environment.required.map((name) => `- \`${name}\``),
    "",
    "## Variáveis opcionais (só nomes)",
    ...manifest.environment.optional.map((name) => `- \`${name}\``),
    "",
    "## Checklist",
    ...manifest.checklist.map(renderChecklistLine),
  );

  if (manifest.warnings.length > 0) {
    lines.push("", "## Avisos", ...manifest.warnings.map((w) => `- ${w}`));
  }
  if (manifest.blockers.length > 0) {
    lines.push("", "## Bloqueios", ...manifest.blockers.map((b) => `- ${b}`));
  }

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
  const target = str(flags.target) as DeploymentTarget | undefined;
  const format = (str(flags.format) ?? "json") as "json" | "markdown";

  const request: DeploymentRequest = {
    clientName: client,
    clientSlug: slug,
    domain,
    plan: plan as DeploymentPlan,
    requestedModules: modulesRaw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
    target,
    branding: {
      appName: str(flags["app-name"]) ?? client,
      legalName: str(flags["legal-name"]),
      logoUrl: str(flags["logo-url"]),
      faviconUrl: str(flags["favicon-url"]),
      supportEmail: str(flags["support-email"]),
      websiteUrl: str(flags["website-url"]),
      fromName: str(flags["from-name"]),
      fromEmail: str(flags["from-email"]),
    },
  };

  const manifest = generateDeploymentManifest(request);

  console.log(format === "markdown" ? renderMarkdown(manifest) : JSON.stringify(manifest, null, 2));

  if (flags["env-template"]) {
    console.log("\n--- .env de exemplo (sem segredos) ---\n");
    console.log(renderEnvTemplate(manifest));
  }

  if (!manifest.valid) {
    console.error(
      `\n✗ manifesto inválido — ${manifest.blockers.length} bloqueio(s). Ver "blockers"/"Bloqueios" acima.`,
    );
    process.exit(1);
  }
}

main();
