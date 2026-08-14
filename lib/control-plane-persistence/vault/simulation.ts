/**
 * Cenários de simulação do Real Vault Backend — `pnpm vault:simulate`
 * (`scripts/vault-backend-simulate.ts`). 100% in-memory/fake: `FakeSecretEncryptionProvider`
 * (nunca pgcrypto real) + `InMemorySecretPayloadRepository` +
 * `createInMemoryProviderCredentialsRuntimeDeps` (nunca banco/rede/Supabase
 * real). Mesmo padrão de `lib/provider-credentials-runtime/simulation.ts` —
 * cada cenário monta seu próprio fixture isolado, nenhum resultado carrega
 * valor de segredo.
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
import { ProviderCredentialAccessDeniedError, SecretResolutionFailedError } from "@/lib/provider-credentials-runtime/errors";
import { createInMemoryProviderCredentialsRuntimeDeps } from "@/lib/provider-credentials-runtime/factory";
import { createPostgresPgcryptoRuntimeVaultProvider } from "@/lib/provider-credentials-runtime/providers/postgres-pgcrypto";
import { RuntimeVaultProviderRegistry } from "@/lib/provider-credentials-runtime/registry";
import { withProviderCredential, type WithProviderCredentialDeps } from "@/lib/provider-credentials-runtime/runtime";
import type { ProviderCredentialPurpose, ProviderCredentialRequest } from "@/lib/provider-credentials-runtime/types";

import { SecretDecryptionFailedError } from "./encryption";
import { FakeSecretEncryptionProvider } from "./encryption-fake";
import { SecretVersionStaleError } from "./errors";
import { InMemorySecretPayloadRepository } from "./secret-payload";
import { revokeSecretValue, rotateSecretValue, storeSecretValue } from "./secret-value-service";
import { VaultReferenceNotFoundError } from "./types";

export const VAULT_BACKEND_SIMULATION_SCENARIO_NAMES = [
  "healthy",
  "cross-tenant",
  "wrong-provider",
  "wrong-purpose",
  "wrong-secret-type",
  "rotate",
  "revoked",
  "corrupted",
  "missing",
  "concurrent-rotation",
] as const;
export type VaultBackendSimulationScenarioName = (typeof VAULT_BACKEND_SIMULATION_SCENARIO_NAMES)[number];

export type VaultBackendSimulationOutcome = "allowed" | "denied" | "error";

export type VaultBackendSimulationResult = {
  scenario: VaultBackendSimulationScenarioName;
  outcome: VaultBackendSimulationOutcome;
  message: string;
  details: Record<string, unknown>;
};

const NOOP_CTX: ControlPlaneActorContext = { emitAudit: async () => {} };

function classifyError(scenario: VaultBackendSimulationScenarioName, error: unknown): VaultBackendSimulationResult {
  if (error instanceof ProviderCredentialAccessDeniedError) {
    return { scenario, outcome: "denied", message: error.reason, details: { blockers: error.blockers } };
  }
  if (
    error instanceof SecretVersionStaleError ||
    error instanceof VaultReferenceNotFoundError ||
    error instanceof SecretDecryptionFailedError ||
    error instanceof SecretResolutionFailedError
  ) {
    return { scenario, outcome: "denied", message: error.message, details: { errorName: error.name } };
  }
  return {
    scenario,
    outcome: "error",
    message: error instanceof Error ? error.message : String(error),
    details: { errorName: error instanceof Error ? error.name : "unknown" },
  };
}

async function buildEnvironment(): Promise<{
  controlPlaneRepos: ControlPlaneRepositories;
  deps: WithProviderCredentialDeps;
  payloadRepository: InMemorySecretPayloadRepository;
  encryptionProvider: FakeSecretEncryptionProvider;
}> {
  const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps();
  const payloadRepository = new InMemorySecretPayloadRepository();
  const encryptionProvider = new FakeSecretEncryptionProvider();

  const registry = new RuntimeVaultProviderRegistry();
  registry.registerProvider(createPostgresPgcryptoRuntimeVaultProvider({ payloadRepository, encryptionProvider }));
  deps.vaultProviderRegistry = registry;

  return { controlPlaneRepos, deps, payloadRepository, encryptionProvider };
}

async function buildInstallation(controlPlaneRepos: ControlPlaneRepositories, demoTenant: Tenant): Promise<{ tenant: Tenant; installation: Installation }> {
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
    { slug: tenant.clientSlug, company: tenant.clientName, status: "provisioning", commercial: "contract", technical: "validated", tenant: tenantWithManifest },
    NOOP_CTX,
  );
  return { tenant, installation };
}

function buildRequest(
  overrides: Pick<ProviderCredentialRequest, "tenantId" | "installationId" | "secretReferenceId"> & Partial<ProviderCredentialRequest>,
): ProviderCredentialRequest {
  return {
    provider: "supabase",
    purpose: "api_call" as ProviderCredentialPurpose,
    operation: "project.read",
    requestedBy: "vault-simulation",
    requestedAt: new Date().toISOString(),
    correlationId: randomUUID(),
    singleUse: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------

async function scenarioHealthy(): Promise<VaultBackendSimulationResult> {
  const { controlPlaneRepos, deps, payloadRepository, encryptionProvider } = await buildEnvironment();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);

  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    { installationId: installation.id, tenantId: tenant.id, reference: `sim-${randomUUID()}`, type: "api_key", provider: "supabase", vaultProvider: "postgres_pgcrypto", vaultKey: "control_plane_secret_ciphertexts" },
    NOOP_CTX,
  );
  await recordProviderConnection(controlPlaneRepos, { installationId: installation.id, provider: "supabase", mode: "dry_run", status: "available", config: {}, secretReferenceId: secretReference.id }, NOOP_CTX);
  await storeSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReference.id, "valor-simulado-nunca-real", NOOP_CTX);

  try {
    const value = await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id }),
      (credential) => credential.use((v) => v.length),
    );
    return { scenario: "healthy", outcome: "allowed", message: "Credencial armazenada, resolvida via pgcrypto (fake) e liberada.", details: { valueLength: value } };
  } catch (error) {
    return classifyError("healthy", error);
  }
}

async function scenarioCrossTenant(): Promise<VaultBackendSimulationResult> {
  const { controlPlaneRepos, deps, payloadRepository, encryptionProvider } = await buildEnvironment();
  const [demoTenantA, demoTenantB] = createDemoTenants();
  const { tenant: tenantA, installation: installationA } = await buildInstallation(controlPlaneRepos, demoTenantA!);
  const { installation: installationB } = await buildInstallation(controlPlaneRepos, demoTenantB!);

  const secretReferenceA = await recordSecretReference(
    controlPlaneRepos,
    { installationId: installationA.id, tenantId: tenantA.id, reference: `sim-${randomUUID()}`, type: "api_key", provider: "supabase", vaultProvider: "postgres_pgcrypto", vaultKey: "control_plane_secret_ciphertexts" },
    NOOP_CTX,
  );
  await storeSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReferenceA.id, "segredo-tenant-a", NOOP_CTX);
  await recordProviderConnection(controlPlaneRepos, { installationId: installationB.id, provider: "supabase", mode: "dry_run", status: "available", config: {}, secretReferenceId: secretReferenceA.id }, NOOP_CTX);

  const installationBFull = await controlPlaneRepos.installations.findInstallation(installationB.id);
  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: installationBFull!.tenant.id, installationId: installationB.id, secretReferenceId: secretReferenceA.id }),
      (credential) => credential.use((v) => v),
    );
    return { scenario: "cross-tenant", outcome: "error", message: "esperava negação cross-tenant, mas passou", details: {} };
  } catch (error) {
    return classifyError("cross-tenant", error);
  }
}

async function scenarioWrongProvider(): Promise<VaultBackendSimulationResult> {
  const { controlPlaneRepos, deps, payloadRepository, encryptionProvider } = await buildEnvironment();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);

  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    { installationId: installation.id, tenantId: tenant.id, reference: `sim-${randomUUID()}`, type: "api_key", provider: "supabase", vaultProvider: "postgres_pgcrypto", vaultKey: "control_plane_secret_ciphertexts" },
    NOOP_CTX,
  );
  await storeSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReference.id, "valor", NOOP_CTX);
  await recordProviderConnection(controlPlaneRepos, { installationId: installation.id, provider: "vercel", mode: "dry_run", status: "available", config: {}, secretReferenceId: secretReference.id }, NOOP_CTX);

  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id, provider: "vercel" }),
      (credential) => credential.use((v) => v),
    );
    return { scenario: "wrong-provider", outcome: "error", message: "esperava negação por provider_mismatch, mas passou", details: {} };
  } catch (error) {
    return classifyError("wrong-provider", error);
  }
}

async function scenarioWrongPurpose(): Promise<VaultBackendSimulationResult> {
  const { controlPlaneRepos, deps, payloadRepository, encryptionProvider } = await buildEnvironment();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);

  // `fake.simulate` exige purpose "api_call" (lib/provisioning-adapters/capabilities.ts).
  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    { installationId: installation.id, tenantId: tenant.id, reference: `sim-${randomUUID()}`, type: "api_key", provider: "fake", vaultProvider: "postgres_pgcrypto", vaultKey: "control_plane_secret_ciphertexts" },
    NOOP_CTX,
  );
  await storeSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReference.id, "valor", NOOP_CTX);
  await recordProviderConnection(controlPlaneRepos, { installationId: installation.id, provider: "fake", mode: "dry_run", status: "available", config: {}, secretReferenceId: secretReference.id }, NOOP_CTX);

  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id, provider: "fake", operation: "simulate", purpose: "messaging" }),
      (credential) => credential.use((v) => v),
    );
    return { scenario: "wrong-purpose", outcome: "error", message: "esperava negação por purpose_not_authorized, mas passou", details: {} };
  } catch (error) {
    return classifyError("wrong-purpose", error);
  }
}

async function scenarioWrongSecretType(): Promise<VaultBackendSimulationResult> {
  const { controlPlaneRepos, deps, payloadRepository, encryptionProvider } = await buildEnvironment();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);

  // `supabase.database.prepare` exige secretType "database_password" — armazenamos "api_key".
  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    { installationId: installation.id, tenantId: tenant.id, reference: `sim-${randomUUID()}`, type: "api_key", provider: "supabase", vaultProvider: "postgres_pgcrypto", vaultKey: "control_plane_secret_ciphertexts" },
    NOOP_CTX,
  );
  await storeSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReference.id, "valor", NOOP_CTX);
  await recordProviderConnection(controlPlaneRepos, { installationId: installation.id, provider: "supabase", mode: "dry_run", status: "available", config: {}, secretReferenceId: secretReference.id }, NOOP_CTX);

  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id, provider: "supabase", operation: "database.prepare", purpose: "database_admin" }),
      (credential) => credential.use((v) => v),
    );
    return { scenario: "wrong-secret-type", outcome: "error", message: "esperava negação por secret_type_mismatch, mas passou", details: {} };
  } catch (error) {
    return classifyError("wrong-secret-type", error);
  }
}

async function scenarioRotate(): Promise<VaultBackendSimulationResult> {
  const { controlPlaneRepos, deps, payloadRepository, encryptionProvider } = await buildEnvironment();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);

  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    { installationId: installation.id, tenantId: tenant.id, reference: `sim-${randomUUID()}`, type: "api_key", provider: "supabase", vaultProvider: "postgres_pgcrypto", vaultKey: "control_plane_secret_ciphertexts" },
    NOOP_CTX,
  );
  await recordProviderConnection(controlPlaneRepos, { installationId: installation.id, provider: "supabase", mode: "dry_run", status: "available", config: {}, secretReferenceId: secretReference.id }, NOOP_CTX);
  await storeSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReference.id, "valor-v1", NOOP_CTX);
  const { reference } = await rotateSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReference.id, "valor-v2", NOOP_CTX);

  try {
    const value = await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id }),
      (credential) => credential.use((v) => v),
    );
    return {
      scenario: "rotate",
      outcome: value === "valor-v2" && reference.version === 2 ? "allowed" : "error",
      message: `Rotação escreveu versão ${reference.version} — resolução usa sempre a versão ativa mais recente.`,
      details: { version: reference.version },
    };
  } catch (error) {
    return classifyError("rotate", error);
  }
}

async function scenarioRevoked(): Promise<VaultBackendSimulationResult> {
  const { controlPlaneRepos, deps, payloadRepository, encryptionProvider } = await buildEnvironment();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);

  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    { installationId: installation.id, tenantId: tenant.id, reference: `sim-${randomUUID()}`, type: "api_key", provider: "supabase", vaultProvider: "postgres_pgcrypto", vaultKey: "control_plane_secret_ciphertexts" },
    NOOP_CTX,
  );
  await recordProviderConnection(controlPlaneRepos, { installationId: installation.id, provider: "supabase", mode: "dry_run", status: "available", config: {}, secretReferenceId: secretReference.id }, NOOP_CTX);
  await storeSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReference.id, "valor", NOOP_CTX);
  await revokeSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReference.id, NOOP_CTX);

  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id }),
      (credential) => credential.use((v) => v),
    );
    return { scenario: "revoked", outcome: "error", message: "esperava negação — reference revogada, mas passou", details: {} };
  } catch (error) {
    return classifyError("revoked", error);
  }
}

async function scenarioCorrupted(): Promise<VaultBackendSimulationResult> {
  const { controlPlaneRepos, deps, payloadRepository, encryptionProvider } = await buildEnvironment();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);

  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    { installationId: installation.id, tenantId: tenant.id, reference: `sim-${randomUUID()}`, type: "api_key", provider: "supabase", vaultProvider: "postgres_pgcrypto", vaultKey: "control_plane_secret_ciphertexts" },
    NOOP_CTX,
  );
  await recordProviderConnection(controlPlaneRepos, { installationId: installation.id, provider: "supabase", mode: "dry_run", status: "available", config: {}, secretReferenceId: secretReference.id }, NOOP_CTX);
  await storeSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReference.id, "valor-integro", NOOP_CTX);
  encryptionProvider.corruptNextCiphertext();

  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id }),
      (credential) => credential.use((v) => v),
    );
    return { scenario: "corrupted", outcome: "error", message: "esperava falha de decrypt, mas passou", details: {} };
  } catch (error) {
    return classifyError("corrupted", error);
  }
}

async function scenarioMissing(): Promise<VaultBackendSimulationResult> {
  const { controlPlaneRepos, deps } = await buildEnvironment();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);

  // Reference criada mas NUNCA teve `storeSecretValue` chamado — sem ciphertext.
  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    { installationId: installation.id, tenantId: tenant.id, reference: `sim-${randomUUID()}`, type: "api_key", provider: "supabase", vaultProvider: "postgres_pgcrypto", vaultKey: "control_plane_secret_ciphertexts" },
    NOOP_CTX,
  );
  await recordProviderConnection(controlPlaneRepos, { installationId: installation.id, provider: "supabase", mode: "dry_run", status: "available", config: {}, secretReferenceId: secretReference.id }, NOOP_CTX);

  try {
    await withProviderCredential(
      deps,
      buildRequest({ tenantId: tenant.id, installationId: installation.id, secretReferenceId: secretReference.id }),
      (credential) => credential.use((v) => v),
    );
    return { scenario: "missing", outcome: "error", message: "esperava negação — nenhum ciphertext armazenado, mas passou", details: {} };
  } catch (error) {
    return classifyError("missing", error);
  }
}

async function scenarioConcurrentRotation(): Promise<VaultBackendSimulationResult> {
  const { controlPlaneRepos, payloadRepository, encryptionProvider } = await buildEnvironment();
  const [demoTenant] = createDemoTenants();
  const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);

  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    { installationId: installation.id, tenantId: tenant.id, reference: `sim-${randomUUID()}`, type: "api_key", provider: "supabase", vaultProvider: "postgres_pgcrypto", vaultKey: "control_plane_secret_ciphertexts" },
    NOOP_CTX,
  );
  await storeSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReference.id, "valor-v1", NOOP_CTX);

  const results = await Promise.allSettled([
    rotateSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReference.id, "valor-concorrente-a", NOOP_CTX),
    rotateSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReference.id, "valor-concorrente-b", NOOP_CTX),
  ]);

  const versions = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof rotateSecretValue>>>).value.version.version);
  const uniqueVersions = new Set(versions);
  const activeVersions = (await payloadRepository.listVersionMetadata(secretReference.id)).filter((v) => v.status === "active");

  const ok = uniqueVersions.size === versions.length && activeVersions.length === 1;
  return {
    scenario: "concurrent-rotation",
    outcome: ok ? "allowed" : "error",
    message: ok
      ? `Duas rotações concorrentes serializaram corretamente — versões ${[...versions].sort().join(", ")}, 1 ativa.`
      : "rotação concorrente produziu estado inconsistente (versão duplicada ou mais de uma ativa)",
    details: { versions, activeVersionCount: activeVersions.length },
  };
}

export const VAULT_BACKEND_SIMULATION_SCENARIOS: Record<VaultBackendSimulationScenarioName, () => Promise<VaultBackendSimulationResult>> = {
  healthy: scenarioHealthy,
  "cross-tenant": scenarioCrossTenant,
  "wrong-provider": scenarioWrongProvider,
  "wrong-purpose": scenarioWrongPurpose,
  "wrong-secret-type": scenarioWrongSecretType,
  rotate: scenarioRotate,
  revoked: scenarioRevoked,
  corrupted: scenarioCorrupted,
  missing: scenarioMissing,
  "concurrent-rotation": scenarioConcurrentRotation,
};

export const VAULT_BACKEND_SIMULATION_EXPECTED_OUTCOMES: Record<VaultBackendSimulationScenarioName, VaultBackendSimulationOutcome> = {
  healthy: "allowed",
  "cross-tenant": "denied",
  "wrong-provider": "denied",
  "wrong-purpose": "denied",
  "wrong-secret-type": "denied",
  rotate: "allowed",
  revoked: "denied",
  corrupted: "denied",
  missing: "denied",
  "concurrent-rotation": "allowed",
};

export function vaultBackendSimulationPassed(result: VaultBackendSimulationResult): boolean {
  return result.outcome === VAULT_BACKEND_SIMULATION_EXPECTED_OUTCOMES[result.scenario];
}

export async function runVaultBackendSimulationScenario(name: VaultBackendSimulationScenarioName): Promise<VaultBackendSimulationResult> {
  return VAULT_BACKEND_SIMULATION_SCENARIOS[name]();
}

export async function runAllVaultBackendSimulationScenarios(): Promise<VaultBackendSimulationResult[]> {
  const results: VaultBackendSimulationResult[] = [];
  for (const name of VAULT_BACKEND_SIMULATION_SCENARIO_NAMES) {
    results.push(await VAULT_BACKEND_SIMULATION_SCENARIOS[name]());
  }
  return results;
}
