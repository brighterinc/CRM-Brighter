/**
 * Cenários de simulação — os mesmos 11 nomeados pedidos pra `pnpm
 * credentials:runtime` (`scripts/credentials-runtime-summary.ts`). 100%
 * in-memory: `createInMemoryProviderCredentialsRuntimeDeps` (nunca banco,
 * nunca rede, nunca provider real). Cada cenário monta seu próprio fixture
 * isolado (tenant + installation + secret reference + provider connection
 * via `lib/control-plane-persistence/services`, mesmo padrão de
 * `scripts/control-plane-persistence-summary.ts::runSmoke`).
 *
 * Nenhum resultado carrega valor de segredo — só metadata/status/blockers.
 */
import { randomUUID } from "node:crypto";

import { generateDeploymentManifest } from "@/lib/deployment";
import type { ControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";
import {
  createPersistedInstallation,
  createPersistedTenant,
  recordProviderConnection,
  recordSecretReference,
  type ControlPlaneActorContext,
} from "@/lib/control-plane-persistence/services";
import type { Installation } from "@/lib/control-plane/types";
import { createDemoTenants } from "@/lib/tenants/repository";
import type { Tenant } from "@/lib/tenants/types";
import { attachDeploymentManifest } from "@/lib/tenants/validation";

import { CredentialEscapeAttemptError, CredentialLeaseInvalidTransitionError, ProviderCredentialAccessDeniedError } from "./errors";
import { createInMemoryProviderCredentialsRuntimeDeps } from "./factory";
import { activateCredentialLease, consumeCredentialLease, createCredentialLease, expireCredentialLease } from "./lease";
import { EnvironmentRuntimeVaultProvider, InMemoryRuntimeVaultProvider, NoopRuntimeVaultProvider } from "./providers";
import { InMemoryCredentialLeaseRepository } from "./repository";
import { RuntimeVaultProviderRegistry } from "./registry";
import { withProviderCredential, type WithProviderCredentialDeps } from "./runtime";
import {
  CredentialAlreadyConsumedError,
  type ProviderCredentialPurpose,
  type ProviderCredentialRequest,
  type SecretReferenceType,
  type VaultProvider,
} from "./types";

export const SIMULATION_SCENARIO_NAMES = [
  "healthy",
  "missing-reference",
  "revoked-reference",
  "cross-tenant-denied",
  "provider-mismatch",
  "expired",
  "single-use",
  "release-on-error",
  "environment-fake",
  "adapter-requirement",
  "blocked-operation",
] as const;
export type SimulationScenarioName = (typeof SIMULATION_SCENARIO_NAMES)[number];

export type SimulationOutcome = "allowed" | "denied" | "error";

export type SimulationScenarioResult = {
  scenario: SimulationScenarioName;
  outcome: SimulationOutcome;
  message: string;
  details: Record<string, unknown>;
};

/**
 * `emitAudit` no-op de propósito — mesmo padrão `NOOP_CTX` de
 * `scripts/control-plane-persistence-summary.ts`: esta simulação é 100%
 * in-memory e nunca deve tocar `api_audit_log` real nem importar `@/lib/audit`
 * (que precisaria de env do Supabase e quebraria o CLI/testes sem `.env`).
 */
const NOOP_CTX: ControlPlaneActorContext = { emitAudit: async () => {} };

function classifyError(scenario: SimulationScenarioName, error: unknown): SimulationScenarioResult {
  if (error instanceof ProviderCredentialAccessDeniedError) {
    return { scenario, outcome: "denied", message: error.reason, details: { blockers: error.blockers } };
  }
  if (error instanceof CredentialAlreadyConsumedError || error instanceof CredentialEscapeAttemptError) {
    return { scenario, outcome: "denied", message: error.message, details: { errorName: error.name } };
  }
  if (error instanceof CredentialLeaseInvalidTransitionError) {
    return { scenario, outcome: "denied", message: error.message, details: { from: error.from, to: error.to } };
  }
  return {
    scenario,
    outcome: "error",
    message: error instanceof Error ? error.message : String(error),
    details: { errorName: error instanceof Error ? error.name : "unknown" },
  };
}

async function buildInstallation(
  controlPlaneRepos: ControlPlaneRepositories,
  demoTenant: Tenant,
): Promise<{ tenant: Tenant; installation: Installation }> {
  const manifest = generateDeploymentManifest({
    clientName: demoTenant.clientName,
    clientSlug: demoTenant.clientSlug,
    domain: demoTenant.domain,
    plan: demoTenant.plan,
    requestedModules: demoTenant.requestedModules,
    branding: demoTenant.branding,
  });
  const attached = attachDeploymentManifest(demoTenant, manifest);
  if (!attached.ok) throw new Error(`fixture de simulação inválida: ${JSON.stringify(attached.errors)}`);

  const tenant = await createPersistedTenant(
    controlPlaneRepos,
    {
      clientName: demoTenant.clientName,
      clientSlug: demoTenant.clientSlug,
      domain: demoTenant.domain,
      plan: demoTenant.plan,
      requestedModules: demoTenant.requestedModules,
      enabledModules: demoTenant.enabledModules,
      branding: demoTenant.branding,
      commercialStatus: demoTenant.commercialStatus,
      technicalStatus: demoTenant.technicalStatus,
    },
    NOOP_CTX,
  );
  const tenantWithManifest = { ...tenant, manifest: attached.tenant.manifest };

  const installation = await createPersistedInstallation(
    controlPlaneRepos,
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

  return { tenant, installation };
}

async function seedCredential(
  controlPlaneRepos: ControlPlaneRepositories,
  deps: WithProviderCredentialDeps,
  installation: Installation,
  tenant: Tenant,
  options: {
    provider?: "fake";
    vaultProvider: VaultProvider;
    vaultKey: string;
    secretType: SecretReferenceType;
    connectionStatus?: "available" | "unavailable" | "planned" | "disabled";
    value?: string;
  },
) {
  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    {
      installationId: installation.id,
      tenantId: tenant.id,
      reference: `sim-${randomUUID()}`,
      type: options.secretType,
      provider: options.provider ?? "fake",
      vaultProvider: options.vaultProvider,
      vaultKey: options.vaultKey,
    },
    NOOP_CTX,
  );

  const connection = await recordProviderConnection(
    controlPlaneRepos,
    {
      installationId: installation.id,
      provider: options.provider ?? "fake",
      mode: "dry_run",
      status: options.connectionStatus ?? "available",
      config: { simulated: true },
      secretReferenceId: secretReference.id,
    },
    NOOP_CTX,
  );

  if (options.vaultProvider === "in_memory" && options.value) {
    const provider = deps.vaultProviderRegistry.findProvider("in_memory");
    if (provider instanceof InMemoryRuntimeVaultProvider) provider.seed(secretReference.id, options.value);
  }

  return { secretReference, connection };
}

function buildRequest(
  overrides: Pick<ProviderCredentialRequest, "tenantId" | "installationId" | "secretReferenceId"> & Partial<ProviderCredentialRequest>,
): ProviderCredentialRequest {
  return {
    provider: "fake",
    purpose: "api_call" as ProviderCredentialPurpose,
    operation: "simulate",
    requestedBy: "simulation",
    requestedAt: new Date().toISOString(),
    correlationId: randomUUID(),
    singleUse: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------

async function scenarioHealthy(): Promise<SimulationScenarioResult> {
  const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);
  const { secretReference } = await seedCredential(controlPlaneRepos, deps, installation, tenant, {
    vaultProvider: "in_memory",
    vaultKey: "sim/fake",
    secretType: "api_key",
    value: "synthetic-value-never-real",
  });

  try {
    const valueLength = await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id }),
      (credential) => credential.use((value) => value.length),
    );
    return { scenario: "healthy", outcome: "allowed", message: "Credencial resolvida, usada e liberada com sucesso.", details: { valueLength } };
  } catch (error) {
    return classifyError("healthy", error);
  }
}

async function scenarioMissingReference(): Promise<SimulationScenarioResult> {
  const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);

  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: randomUUID() }),
      (credential) => credential.use((v) => v),
    );
    return { scenario: "missing-reference", outcome: "error", message: "esperava negação, mas passou", details: {} };
  } catch (error) {
    return classifyError("missing-reference", error);
  }
}

async function scenarioRevokedReference(): Promise<SimulationScenarioResult> {
  const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);
  const { secretReference } = await seedCredential(controlPlaneRepos, deps, installation, tenant, {
    vaultProvider: "in_memory",
    vaultKey: "sim/fake",
    secretType: "api_key",
    value: "synthetic-value-never-real",
  });
  await controlPlaneRepos.vault.revokeReference(secretReference.id);

  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id }),
      (credential) => credential.use((v) => v),
    );
    return { scenario: "revoked-reference", outcome: "error", message: "esperava negação, mas passou", details: {} };
  } catch (error) {
    return classifyError("revoked-reference", error);
  }
}

async function scenarioCrossTenantDenied(): Promise<SimulationScenarioResult> {
  const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps();
  const [demoTenantA, demoTenantB] = createDemoTenants();
  const { tenant: tenantA, installation: installationA } = await buildInstallation(controlPlaneRepos, demoTenantA!);
  const { tenant: tenantB, installation: installationB } = await buildInstallation(controlPlaneRepos, demoTenantB!);

  const { secretReference: secretReferenceA } = await seedCredential(controlPlaneRepos, deps, installationA, tenantA, {
    vaultProvider: "in_memory",
    vaultKey: "sim/fake-a",
    secretType: "api_key",
    value: "synthetic-value-tenant-a",
  });

  // Instalação B tem uma conexão pro mesmo provider, mas apontando (por
  // engano/ataque) pra secret reference do tenant A — o teste é justamente
  // que a POLICY recuse isso mesmo com uma conexão "válida" na tabela.
  await recordProviderConnection(
    controlPlaneRepos,
    {
      installationId: installationB.id,
      provider: "fake",
      mode: "dry_run",
      status: "available",
      config: { simulated: true },
      secretReferenceId: secretReferenceA.id,
    },
    NOOP_CTX,
  );

  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenantB.id, installationId: installationB.id, secretReferenceId: secretReferenceA.id }),
      (credential) => credential.use((v) => v),
    );
    return { scenario: "cross-tenant-denied", outcome: "error", message: "esperava negação cross-tenant, mas passou", details: {} };
  } catch (error) {
    return classifyError("cross-tenant-denied", error);
  }
}

async function scenarioProviderMismatch(): Promise<SimulationScenarioResult> {
  const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);
  const { secretReference } = await seedCredential(controlPlaneRepos, deps, installation, tenant, {
    vaultProvider: "in_memory",
    vaultKey: "sim/fake",
    secretType: "api_key",
    value: "synthetic-value-never-real",
  });

  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id, provider: "supabase" }),
      (credential) => credential.use((v) => v),
    );
    return { scenario: "provider-mismatch", outcome: "error", message: "esperava negação, mas passou", details: {} };
  } catch (error) {
    return classifyError("provider-mismatch", error);
  }
}

async function scenarioExpired(): Promise<SimulationScenarioResult> {
  const leaseRepo = new InMemoryCredentialLeaseRepository();
  const lease = await createCredentialLease(leaseRepo, {
    tenantId: "sim-tenant",
    installationId: "sim-installation",
    provider: "fake",
    secretReferenceId: "sim-secret",
    purpose: "api_call",
    operation: "simulate",
    singleUse: true,
    correlationId: randomUUID(),
    requestedBy: null,
  });
  await activateCredentialLease(leaseRepo, lease.id);
  await expireCredentialLease(leaseRepo, lease.id);

  try {
    await consumeCredentialLease(leaseRepo, lease.id);
    return { scenario: "expired", outcome: "error", message: "esperava falha ao consumir lease expirada, mas não falhou", details: {} };
  } catch (error) {
    return classifyError("expired", error);
  }
}

async function scenarioSingleUse(): Promise<SimulationScenarioResult> {
  const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);
  const { secretReference } = await seedCredential(controlPlaneRepos, deps, installation, tenant, {
    vaultProvider: "in_memory",
    vaultKey: "sim/fake",
    secretType: "api_key",
    value: "synthetic-value-never-real",
  });

  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id, singleUse: true }),
      (credential) =>
        credential.use((v) => v.length).toString() +
        credential.use((v) => v.length), // segunda chamada — deve lançar CredentialAlreadyConsumedError
    );
    return { scenario: "single-use", outcome: "error", message: "esperava falha no segundo .use(), mas não falhou", details: {} };
  } catch (error) {
    return classifyError("single-use", error);
  }
}

async function scenarioReleaseOnError(): Promise<SimulationScenarioResult> {
  const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);
  const { secretReference } = await seedCredential(controlPlaneRepos, deps, installation, tenant, {
    vaultProvider: "in_memory",
    vaultKey: "sim/fake",
    secretType: "api_key",
    value: "synthetic-value-never-real",
  });

  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id }),
      () => {
        throw new Error("falha intencional — provando release-on-error");
      },
    );
    return { scenario: "release-on-error", outcome: "error", message: "esperava propagação do erro, mas não propagou", details: {} };
  } catch (error) {
    const leases = await deps.leaseRepository.listByInstallation(installation.id);
    const lastLease = leases[0];
    return {
      ...classifyError("release-on-error", error),
      details: { ...classifyError("release-on-error", error).details, leaseStatus: lastLease?.status ?? "unknown" },
    };
  }
}

async function scenarioEnvironmentFake(): Promise<SimulationScenarioResult> {
  const envVarName = "BRIGHTER_RUNTIME_SIMULATION_TOKEN";
  const previousValue = process.env[envVarName];
  process.env[envVarName] = "synthetic-value-for-simulation-only";

  try {
    const registry = new RuntimeVaultProviderRegistry();
    registry.registerProvider(new NoopRuntimeVaultProvider());
    registry.registerProvider(new InMemoryRuntimeVaultProvider());
    registry.registerProvider(new EnvironmentRuntimeVaultProvider({ enabled: true }));

    const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps({ vaultProviderRegistry: registry });
    const [demoTenant] = createDemoTenants();
    const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);
    const { secretReference } = await seedCredential(controlPlaneRepos, deps, installation, tenant, {
      vaultProvider: "database_placeholder",
      vaultKey: envVarName,
      secretType: "api_key",
    });

    try {
      const valueLength = await withProviderCredential(
        deps,
        buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id }),
        (credential) => credential.use((value) => value.length),
      );
      return {
        scenario: "environment-fake",
        outcome: "allowed",
        message: `Credencial resolvida via EnvironmentRuntimeVaultProvider (env var "${envVarName}", nunca do .env real).`,
        details: { valueLength },
      };
    } catch (error) {
      return classifyError("environment-fake", error);
    }
  } finally {
    if (previousValue === undefined) delete process.env[envVarName];
    else process.env[envVarName] = previousValue;
  }
}

async function scenarioAdapterRequirement(): Promise<SimulationScenarioResult> {
  const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);
  const { secretReference } = await seedCredential(controlPlaneRepos, deps, installation, tenant, {
    vaultProvider: "in_memory",
    vaultKey: "sim/fake",
    secretType: "api_key",
    value: "synthetic-value-never-real",
  });

  // `fake.simulate` declara `requiredCredentialPurpose: "api_call"` no
  // catálogo (`lib/provisioning-adapters/capabilities.ts`) — provamos os
  // dois lados: purpose correto passa, purpose errado é negado.
  const matching = await withProviderCredential(
    deps,
    buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id, purpose: "api_call" }),
    (credential) => credential.use(() => "ok"),
  ).catch((error: unknown) => classifyError("adapter-requirement", error));

  const mismatched = await withProviderCredential(
    deps,
    buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id, purpose: "messaging" }),
    (credential) => credential.use(() => "ok"),
  ).catch((error: unknown) => classifyError("adapter-requirement", error));

  const matchingOk = matching === "ok";
  const mismatchedDenied = typeof mismatched === "object" && mismatched.outcome === "denied";

  return {
    scenario: "adapter-requirement",
    outcome: matchingOk && mismatchedDenied ? "allowed" : "error",
    message: "Purpose declarado pelo adapter (fake.simulate → api_call) é exigido pela policy.",
    details: { matchingOk, mismatchedDenied, mismatchedDetails: typeof mismatched === "object" ? mismatched.details : null },
  };
}

async function scenarioBlockedOperation(): Promise<SimulationScenarioResult> {
  const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);
  const { secretReference } = await seedCredential(controlPlaneRepos, deps, installation, tenant, {
    vaultProvider: "in_memory",
    vaultKey: "sim/fake",
    secretType: "api_key",
    value: "synthetic-value-never-real",
  });
  await controlPlaneRepos.installations.updateInstallation(installation.id, { status: "archived" });

  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id }),
      (credential) => credential.use((v) => v),
    );
    return { scenario: "blocked-operation", outcome: "error", message: "esperava negação, mas passou", details: {} };
  } catch (error) {
    return classifyError("blocked-operation", error);
  }
}

export const SIMULATION_SCENARIOS: Record<SimulationScenarioName, () => Promise<SimulationScenarioResult>> = {
  healthy: scenarioHealthy,
  "missing-reference": scenarioMissingReference,
  "revoked-reference": scenarioRevokedReference,
  "cross-tenant-denied": scenarioCrossTenantDenied,
  "provider-mismatch": scenarioProviderMismatch,
  expired: scenarioExpired,
  "single-use": scenarioSingleUse,
  "release-on-error": scenarioReleaseOnError,
  "environment-fake": scenarioEnvironmentFake,
  "adapter-requirement": scenarioAdapterRequirement,
  "blocked-operation": scenarioBlockedOperation,
};

/**
 * Outcome ESPERADO por cenário — usado por quem quiser saber se um
 * `SimulationScenarioResult` "passou" (provou o que o nome promete) ou
 * "falhou de verdade". `release-on-error` é o único caso em que `outcome:
 * "error"` É o resultado correto (o cenário existe pra provar que o erro do
 * callback propaga e a lease termina em `failed`) — nunca trate `"error"`
 * como falha universal sem checar contra este mapa.
 */
export const SIMULATION_SCENARIO_EXPECTED_OUTCOMES: Record<SimulationScenarioName, SimulationOutcome> = {
  healthy: "allowed",
  "missing-reference": "denied",
  "revoked-reference": "denied",
  "cross-tenant-denied": "denied",
  "provider-mismatch": "denied",
  expired: "denied",
  "single-use": "denied",
  "release-on-error": "error",
  "environment-fake": "allowed",
  "adapter-requirement": "allowed",
  "blocked-operation": "denied",
};

export function simulationScenarioPassed(result: SimulationScenarioResult): boolean {
  return result.outcome === SIMULATION_SCENARIO_EXPECTED_OUTCOMES[result.scenario];
}

export async function runSimulationScenario(name: SimulationScenarioName): Promise<SimulationScenarioResult> {
  return SIMULATION_SCENARIOS[name]();
}

export async function runAllSimulationScenarios(): Promise<SimulationScenarioResult[]> {
  const results: SimulationScenarioResult[] = [];
  for (const name of SIMULATION_SCENARIO_NAMES) {
    results.push(await SIMULATION_SCENARIOS[name]());
  }
  return results;
}
