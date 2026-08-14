/**
 * CLI do Real Supabase Adapter — v1.
 *
 * 100% fake/mocked (`createInMemoryProviderCredentialsRuntimeDeps` +
 * `fetchImpl` fake por cenário) — NÃO chama a Supabase Management API de
 * verdade, NÃO cria projeto nenhum, NÃO altera `.env` real (o gate é setado
 * e restaurado DENTRO de cada cenário, mesmo padrão de `environment-fake` em
 * `credentials-runtime-summary.ts`). Nenhum cenário aqui roda sem o
 * REAL_PROVISIONING_ENABLED explícito — e mesmo assim, tudo é fetch mockado.
 *
 * Uso:
 *   pnpm supabase:adapter -- --scenario dry-run
 *   pnpm supabase:adapter -- --scenario all --format json
 *
 * Cenários: dry-run, gate-disabled, credential-invalid, project-found,
 * project-missing, rate-limit, timeout, conflict, retry-success.
 */
import { randomUUID } from "node:crypto";

import { createPersistedInstallation, createPersistedTenant, recordProviderConnection, recordSecretReference, type ControlPlaneActorContext } from "../lib/control-plane-persistence/services";
import { generateDeploymentManifest } from "../lib/deployment";
import type { InMemoryRuntimeVaultProvider } from "../lib/provider-credentials-runtime/providers";
import { createInMemoryProviderCredentialsRuntimeDeps } from "../lib/provider-credentials-runtime/factory";
import {
  dryRunSupabaseRealOperation,
  executeRealSupabaseOperation,
  SupabaseManagementClient,
  type SupabaseRealExecutionDeps,
} from "../lib/provisioning-adapters/providers/supabase-real";
import { resolveCredentialRequirementForSupabaseRealOperation } from "../lib/provisioning-adapters/providers/supabase-real-operations";
import { createDemoTenants } from "../lib/tenants/repository";
import { attachDeploymentManifest } from "../lib/tenants/validation";

const NOOP_CTX: ControlPlaneActorContext = { emitAudit: async () => {} };
const FAKE_TOKEN = "sbp_cli-fake-token-never-real";

const SCENARIO_NAMES = [
  "dry-run",
  "gate-disabled",
  "credential-invalid",
  "project-found",
  "project-missing",
  "rate-limit",
  "timeout",
  "conflict",
  "retry-success",
] as const;
type ScenarioName = (typeof SCENARIO_NAMES)[number];

type Flags = Record<string, string | boolean>;
type Format = "json" | "markdown";

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

function usage(): never {
  console.error(["Uso:", "  pnpm supabase:adapter -- --scenario <nome>|all --format json|markdown", "", `Cenários: ${SCENARIO_NAMES.join(", ")}`].join("\n"));
  process.exit(1);
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

async function withGate<T>(enabled: boolean, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.REAL_PROVISIONING_ENABLED;
  process.env.REAL_PROVISIONING_ENABLED = enabled ? "true" : "false";
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.REAL_PROVISIONING_ENABLED;
    else process.env.REAL_PROVISIONING_ENABLED = previous;
  }
}

async function buildFixture() {
  const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps({
    loadAdapterRequirement: resolveCredentialRequirementForSupabaseRealOperation,
  });

  const [demoTenant] = createDemoTenants();
  const manifest = generateDeploymentManifest({
    clientName: demoTenant!.clientName,
    clientSlug: demoTenant!.clientSlug,
    domain: demoTenant!.domain,
    plan: demoTenant!.plan,
    requestedModules: demoTenant!.requestedModules,
    branding: demoTenant!.branding,
  });
  const attached = attachDeploymentManifest(demoTenant!, manifest);
  if (!attached.ok) throw new Error("fixture inválida");

  const tenant = await createPersistedTenant(
    controlPlaneRepos,
    {
      clientName: demoTenant!.clientName,
      clientSlug: demoTenant!.clientSlug,
      domain: demoTenant!.domain,
      plan: demoTenant!.plan,
      requestedModules: demoTenant!.requestedModules,
      enabledModules: demoTenant!.enabledModules,
      branding: demoTenant!.branding,
      commercialStatus: demoTenant!.commercialStatus,
      technicalStatus: demoTenant!.technicalStatus,
    },
    NOOP_CTX,
  );
  const installation = await createPersistedInstallation(
    controlPlaneRepos,
    { slug: tenant.clientSlug, company: tenant.clientName, status: "provisioning", commercial: "contract", technical: "validated", tenant: { ...tenant, manifest: attached.tenant.manifest } },
    NOOP_CTX,
  );

  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    { installationId: installation.id, tenantId: tenant.id, reference: `cli-${randomUUID()}`, type: "api_key", provider: "supabase", vaultProvider: "in_memory", vaultKey: "cli/key" },
    NOOP_CTX,
  );
  await recordProviderConnection(
    controlPlaneRepos,
    { installationId: installation.id, provider: "supabase", mode: "dry_run", status: "available", config: {}, secretReferenceId: secretReference.id },
    NOOP_CTX,
  );

  const inMemoryProvider = deps.vaultProviderRegistry.findProvider("in_memory") as InMemoryRuntimeVaultProvider;
  inMemoryProvider.seed(secretReference.id, FAKE_TOKEN);

  return { deps, controlPlaneRepos, installation, tenant };
}

function buildExecDeps(fixture: Awaited<ReturnType<typeof buildFixture>>, fetchImpl: typeof fetch): SupabaseRealExecutionDeps {
  return {
    controlPlaneRepos: fixture.controlPlaneRepos,
    providerCredentialDeps: fixture.deps,
    actorContext: NOOP_CTX,
    client: new SupabaseManagementClient({ fetchImpl, timeoutMs: 300 }),
    retryPolicy: { maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 10 },
    sleep: async () => {},
  };
}

type ScenarioResult = { scenario: ScenarioName; outcome: "ok" | "blocked" | "error"; message: string; details: unknown };

async function runScenario(scenario: ScenarioName): Promise<ScenarioResult> {
  const fixture = await buildFixture();
  const correlationId = randomUUID();
  const request = {
    installationId: fixture.installation.id,
    tenantId: fixture.tenant.id,
    operation: "project.read" as const,
    input: { projectRef: "proj_cli_demo" },
    correlationId,
    requestedAt: new Date().toISOString(),
  };

  switch (scenario) {
    case "dry-run": {
      const result = dryRunSupabaseRealOperation(request);
      return { scenario, outcome: "ok", message: "dry-run nunca toca rede — funciona com o gate desligado.", details: result };
    }

    case "gate-disabled": {
      return withGate(false, async () => {
        const execDeps = buildExecDeps(fixture, async () => jsonResponse(200, { id: "proj_cli_demo" }));
        try {
          await executeRealSupabaseOperation(execDeps, request);
          return { scenario, outcome: "error", message: "esperava bloqueio — não deveria ter executado", details: null };
        } catch (error) {
          return { scenario, outcome: "blocked", message: (error as Error).message, details: { errorName: (error as Error).name } };
        }
      });
    }

    case "credential-invalid": {
      return withGate(true, async () => {
        const execDeps = buildExecDeps(fixture, async () => jsonResponse(401, { message: "invalid token" }));
        try {
          await executeRealSupabaseOperation(execDeps, request);
          return { scenario, outcome: "error", message: "esperava 401 — não deveria ter sucedido", details: null };
        } catch (error) {
          return { scenario, outcome: "blocked", message: (error as Error).message, details: { errorName: (error as Error).name } };
        }
      });
    }

    case "project-found": {
      return withGate(true, async () => {
        const execDeps = buildExecDeps(
          fixture,
          async () => jsonResponse(200, { id: "proj_cli_demo", name: "Demo", region: "us-east-1", status: "ACTIVE_HEALTHY", organization_id: "org_1", created_at: "2026-01-01T00:00:00Z" }),
        );
        const result = await executeRealSupabaseOperation(execDeps, request);
        return { scenario, outcome: "ok", message: "projeto lido com sucesso (fetch mockado).", details: result };
      });
    }

    case "project-missing": {
      return withGate(true, async () => {
        const execDeps = buildExecDeps(fixture, async () => jsonResponse(404, { message: "not found" }));
        try {
          await executeRealSupabaseOperation(execDeps, request);
          return { scenario, outcome: "error", message: "esperava 404 — não deveria ter sucedido", details: null };
        } catch (error) {
          return { scenario, outcome: "blocked", message: (error as Error).message, details: { errorName: (error as Error).name } };
        }
      });
    }

    case "rate-limit": {
      return withGate(true, async () => {
        let calls = 0;
        const execDeps = buildExecDeps(fixture, async () => {
          calls += 1;
          return jsonResponse(429, { message: "rate limited" }, { "retry-after": "1" });
        });
        try {
          await executeRealSupabaseOperation(execDeps, request);
          return { scenario, outcome: "error", message: "esperava falha após esgotar retries", details: { calls } };
        } catch (error) {
          return { scenario, outcome: "blocked", message: `${(error as Error).message} (tentativas: ${calls})`, details: { errorName: (error as Error).name, calls } };
        }
      });
    }

    case "timeout": {
      return withGate(true, async () => {
        // Client próprio com timeout curto (50ms) pra este cenário não
        // travar o CLI — `fetchImpl` nunca resolve, só rejeita quando o
        // `AbortController` interno do client dispara.
        const timeoutClient = new SupabaseManagementClient({
          timeoutMs: 50,
          fetchImpl: async (_url, init) =>
            new Promise<Response>((_resolve, reject) => {
              const signal = init?.signal as AbortSignal | undefined;
              signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
            }),
        });
        const execDeps: SupabaseRealExecutionDeps = { ...buildExecDeps(fixture, async () => jsonResponse(200, {})), client: timeoutClient };
        try {
          await executeRealSupabaseOperation(execDeps, request);
          return { scenario, outcome: "error", message: "esperava timeout — não deveria ter sucedido", details: null };
        } catch (error) {
          return { scenario, outcome: "blocked", message: (error as Error).message, details: { errorName: (error as Error).name } };
        }
      });
    }

    case "conflict": {
      return withGate(true, async () => {
        const execDeps = buildExecDeps(fixture, async () => jsonResponse(409, { message: "conflict" }));
        try {
          await executeRealSupabaseOperation(execDeps, request);
          return { scenario, outcome: "error", message: "esperava 409 — não deveria ter sucedido", details: null };
        } catch (error) {
          return { scenario, outcome: "blocked", message: (error as Error).message, details: { errorName: (error as Error).name } };
        }
      });
    }

    case "retry-success": {
      return withGate(true, async () => {
        let calls = 0;
        const execDeps = buildExecDeps(fixture, async () => {
          calls += 1;
          if (calls < 3) return jsonResponse(503, { message: "temporarily unavailable" });
          return jsonResponse(200, { id: "proj_cli_demo", status: "ACTIVE_HEALTHY" });
        });
        const result = await executeRealSupabaseOperation(execDeps, request);
        return { scenario, outcome: "ok", message: `sucesso após ${result.attempts} tentativa(s).`, details: result };
      });
    }
  }
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  const format = (str(flags.format) ?? "markdown") as Format;
  const scenario = str(flags.scenario);
  if (!scenario) usage();

  const names: ScenarioName[] = scenario === "all" ? [...SCENARIO_NAMES] : [scenario as ScenarioName];
  if (scenario !== "all" && !(SCENARIO_NAMES as readonly string[]).includes(scenario)) usage();

  const results: ScenarioResult[] = [];
  for (const name of names) {
    results.push(await runScenario(name));
  }

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log("# Real Supabase Adapter — CLI (100% mockado, nenhuma chamada real)\n");
    for (const result of results) {
      console.log(`## \`${result.scenario}\` — ${result.outcome}\n\n${result.message}\n`);
    }
  }

  const failed = results.filter((r) => r.outcome === "error");
  if (failed.length > 0) {
    console.error(`\n✗ ${failed.length} cenário(s) com resultado inesperado: ${failed.map((f) => f.scenario).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("✗ erro no CLI do Real Supabase Adapter:", err);
  process.exitCode = 1;
});
