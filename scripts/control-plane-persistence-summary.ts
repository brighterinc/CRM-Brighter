/**
 * CLI da Brighter Control Plane Persistence — v1.
 *
 * SEMPRE roda contra `createControlPlaneRepositories("memory")` — este
 * arquivo nem IMPORTA o modo `"database"` de propósito, pra ser
 * estruturalmente impossível este CLI tocar um banco real. NÃO cria
 * VPS/Supabase/Vercel/DNS/Docker/Redis/WhatsApp de verdade, NÃO chama rede,
 * NÃO altera `.env` real, NÃO acessa a Lumina.
 *
 * Uso:
 *   pnpm control:persistence -- --mode schema    --format markdown
 *   pnpm control:persistence -- --mode fixtures  --format json
 *   pnpm control:persistence -- --mode smoke     --format markdown   (default)
 *
 * `schema`   — resumo estático das 8 tabelas (colunas, RLS, FKs) da migration
 *              0098, sem tocar repository nenhum.
 * `fixtures` — monta um tenant + installation de demonstração via
 *              repositories in-memory e imprime o preview.
 * `smoke`    — fluxo completo in-memory (tenant → installation → deployment
 *              → provisioning run/step → provider connection → secret
 *              reference → operation event) via a camada de serviço
 *              (`services.ts`), provando que a orquestração completa
 *              funciona sem banco real.
 */
import { randomUUID } from "node:crypto";

import { generateDeploymentManifest } from "../lib/deployment";
import { createControlPlaneRepositories } from "../lib/control-plane-persistence/repositories/factory";
import {
  createPersistedInstallation,
  createPersistedTenant,
  createProvisioningRun,
  recordDeployment,
  recordOperationEvent,
  recordProviderConnection,
  recordProvisioningStep,
  recordSecretReference,
} from "../lib/control-plane-persistence/services";
import { createDemoTenants } from "../lib/tenants/repository";
import { attachDeploymentManifest } from "../lib/tenants/validation";

type Flags = Record<string, string | boolean>;
type Mode = "schema" | "fixtures" | "smoke";
type Format = "json" | "markdown";

const SCHEMA_SUMMARY = [
  { table: "control_plane_tenants", rls: "platform_admin_only (FOR ALL)", notableFks: "—" },
  { table: "control_plane_installations", rls: "platform_admin_only (FOR ALL)", notableFks: "tenant_id → control_plane_tenants (cascade)" },
  { table: "control_plane_deployments", rls: "platform_admin_only (FOR ALL)", notableFks: "installation_id/tenant_id (cascade)" },
  { table: "control_plane_provisioning_runs", rls: "platform_admin_only (FOR ALL)", notableFks: "installation_id/tenant_id (cascade)" },
  { table: "control_plane_provisioning_steps", rls: "platform_admin_only (FOR ALL)", notableFks: "run_id → provisioning_runs (cascade); unique(run_id, step_id)" },
  { table: "control_plane_secret_references", rls: "platform_admin_only (FOR ALL)", notableFks: "installation_id/tenant_id (set null) — NUNCA guarda valor de segredo" },
  { table: "control_plane_provider_connections", rls: "platform_admin_only (FOR ALL)", notableFks: "installation_id (cascade); secret_reference_id (set null); unique(installation_id, provider)" },
  { table: "control_plane_operation_events", rls: "platform_admin_only (SELECT + INSERT, sem UPDATE/DELETE — append-only)", notableFks: "installation_id/tenant_id/provisioning_run_id (set null)" },
] as const;

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

function renderSchemaMarkdown(): string {
  const lines = ["# Control Plane Persistence — Schema (migration 0098)", "", "| Tabela | RLS | FKs notáveis |", "|---|---|---|"];
  for (const row of SCHEMA_SUMMARY) lines.push(`| \`${row.table}\` | ${row.rls} | ${row.notableFks} |`);
  lines.push("", "Nenhuma tabela tem `organization_id` — Control Plane é plataforma, não tenant da CRM.");
  return lines.join("\n");
}

async function buildFixtureTenant() {
  const [demoTenant] = createDemoTenants();
  if (!demoTenant) throw new Error("createDemoTenants() não retornou fixture");
  const manifest = generateDeploymentManifest({
    clientName: demoTenant.clientName,
    clientSlug: demoTenant.clientSlug,
    domain: demoTenant.domain,
    plan: demoTenant.plan,
    requestedModules: demoTenant.requestedModules,
    branding: demoTenant.branding,
  });
  const attached = attachDeploymentManifest(demoTenant, manifest);
  if (!attached.ok) throw new Error(`fixture inválida: ${JSON.stringify(attached.errors)}`);
  return attached.tenant;
}

/**
 * `emitAudit` no-op de propósito: este CLI é 100% in-memory e nunca deve
 * tocar `api_audit_log` real — passar o no-op também evita que a camada de
 * serviço importe `@/lib/audit` (que precisaria de env do Supabase).
 */
const NOOP_CTX = { emitAudit: async () => {} };

async function runSmoke() {
  const repos = await createControlPlaneRepositories("memory");
  const fixtureTenant = await buildFixtureTenant();

  const tenant = await createPersistedTenant(
    repos,
    {
      clientName: fixtureTenant.clientName,
      clientSlug: fixtureTenant.clientSlug,
      domain: fixtureTenant.domain,
      plan: fixtureTenant.plan,
      requestedModules: fixtureTenant.requestedModules,
      enabledModules: fixtureTenant.enabledModules,
      branding: fixtureTenant.branding,
      commercialStatus: fixtureTenant.commercialStatus,
      technicalStatus: fixtureTenant.technicalStatus,
    },
    NOOP_CTX,
  );
  const tenantWithManifest = { ...tenant, manifest: fixtureTenant.manifest };

  const installation = await createPersistedInstallation(
    repos,
    {
      slug: tenant.clientSlug,
      company: tenant.clientName,
      status: "provisioning",
      commercial: "contract",
      technical: "validated",
      tenant: tenantWithManifest,
    },
    NOOP_CTX,
  );

  const deployment = await recordDeployment(
    repos,
    {
      installationId: installation.id,
      tenantId: tenant.id,
      target: installation.deployment.target,
      plan: installation.deploymentPlan,
      manifestFingerprint: randomUUID(),
      manifestSnapshot: { target: installation.deployment.target, plan: installation.deploymentPlan },
    },
    NOOP_CTX,
  );

  const run = await createProvisioningRun(
    repos,
    {
      installationId: installation.id,
      tenantId: tenant.id,
      plan: installation.deploymentPlan,
      target: installation.deployment.target,
      manifestFingerprint: deployment.manifestFingerprint,
      status: "running",
    },
    NOOP_CTX,
  );

  const step = await recordProvisioningStep(
    repos,
    {
      runId: run.id,
      stepId: "database_provision",
      category: "database",
      status: "completed",
      attempts: 1,
    },
    NOOP_CTX,
  );

  const secretReference = await recordSecretReference(
    repos,
    {
      installationId: installation.id,
      tenantId: tenant.id,
      reference: `smoke-${randomUUID()}`,
      type: "api_key",
      provider: "supabase",
      vaultProvider: "in_memory",
      vaultKey: `placeholder/${randomUUID()}`,
    },
    NOOP_CTX,
  );

  const connection = await recordProviderConnection(
    repos,
    {
      installationId: installation.id,
      provider: "supabase",
      mode: "dry_run",
      status: "available",
      config: { region: "sa-east-1" },
      secretReferenceId: secretReference.id,
    },
    NOOP_CTX,
  );

  const event = await recordOperationEvent(
    repos,
    {
      installationId: installation.id,
      tenantId: tenant.id,
      eventType: "installation.updated",
      severity: "info",
      message: "Smoke test do CLI concluído.",
      metadata: { source: "cli" },
    },
    NOOP_CTX,
  );

  return { tenant, installation, deployment, run, step, secretReference, connection, event };
}

function usage(): never {
  console.error(["Uso:", "  pnpm control:persistence -- --mode schema|fixtures|smoke --format json|markdown"].join("\n"));
  process.exit(1);
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  const mode = (str(flags.mode) ?? "smoke") as Mode;
  const format = (str(flags.format) ?? "markdown") as Format;
  if (!["schema", "fixtures", "smoke"].includes(mode)) usage();

  if (mode === "schema") {
    if (format === "json") console.log(JSON.stringify({ tables: SCHEMA_SUMMARY }, null, 2));
    else console.log(renderSchemaMarkdown());
    return;
  }

  if (mode === "fixtures") {
    const fixtureTenant = await buildFixtureTenant();
    if (format === "json") console.log(JSON.stringify({ fixtureTenant }, null, 2));
    else console.log(`# Fixture preview\n\nTenant: **${fixtureTenant.clientName}** (${fixtureTenant.clientSlug}), plano ${fixtureTenant.plan}.`);
    return;
  }

  const result = await runSmoke();
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      [
        "# Control Plane Persistence — smoke test (in-memory)",
        "",
        `- Tenant: **${result.tenant.clientName}** (\`${result.tenant.id}\`)`,
        `- Installation: **${result.installation.company}** — status \`${result.installation.status}\``,
        `- Deployment recorded: fingerprint \`${result.deployment.manifestFingerprint}\``,
        `- Provisioning run: \`${result.run.id}\` (status ${result.run.status})`,
        `- Provisioning step: \`${result.step.stepId}\` → ${result.step.status}`,
        `- Secret reference: \`${result.secretReference.reference}\` (${result.secretReference.type}/${result.secretReference.provider}) — vault_key NUNCA impresso`,
        `- Provider connection: ${result.connection.provider} (${result.connection.mode})`,
        `- Operation event: ${result.event.eventType}`,
        "",
        "✓ fluxo completo in-memory OK — nenhum banco real tocado.",
      ].join("\n"),
    );
  }
}

main().catch((err) => {
  console.error("✗ erro no CLI de control-plane-persistence:", err);
  process.exitCode = 1;
});
