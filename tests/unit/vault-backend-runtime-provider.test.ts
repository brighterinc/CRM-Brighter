import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { generateDeploymentManifest } from "@/lib/deployment";
import { FakeSecretEncryptionProvider } from "@/lib/control-plane-persistence/vault/encryption-fake";
import { SecretVersionStaleError } from "@/lib/control-plane-persistence/vault/errors";
import { createRealVaultBackendRuntimeVaultProvider } from "@/lib/control-plane-persistence/vault/factory";
import { InMemorySecretPayloadRepository } from "@/lib/control-plane-persistence/vault/secret-payload";
import { storeSecretValue } from "@/lib/control-plane-persistence/vault/secret-value-service";
import { createControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";
import {
  createPersistedInstallation,
  createPersistedTenant,
  recordProviderConnection,
  recordSecretReference,
  type ControlPlaneActorContext,
} from "@/lib/control-plane-persistence/services";
import { createDemoTenants } from "@/lib/tenants/repository";
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import { ProviderCredentialAccessDeniedError } from "@/lib/provider-credentials-runtime/errors";
import { createPostgresPgcryptoRuntimeVaultProvider } from "@/lib/provider-credentials-runtime/providers/postgres-pgcrypto";
import { RuntimeVaultProviderRegistry } from "@/lib/provider-credentials-runtime/registry";
import { withProviderCredential } from "@/lib/provider-credentials-runtime/runtime";
import { createInMemoryProviderCredentialsRuntimeDeps } from "@/lib/provider-credentials-runtime/factory";
import type { SecretReferenceMetadata } from "@/lib/control-plane-persistence/types";

const NOOP_CTX: ControlPlaneActorContext = { emitAudit: async () => {} };

function fixtureReference(overrides: Partial<SecretReferenceMetadata> = {}): SecretReferenceMetadata {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    installationId: "installation-1",
    tenantId: "tenant-1",
    reference: "ref-1",
    type: "api_key",
    provider: "supabase",
    vaultProvider: "postgres_pgcrypto",
    vaultKey: "control_plane_secret_ciphertexts",
    version: 1,
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("PostgresPgcryptoRuntimeVaultProvider — unit", () => {
  it("resolveSecret decifra o valor e devolve um ResolvedCredential", async () => {
    const payloadRepository = new InMemorySecretPayloadRepository();
    const encryptionProvider = new FakeSecretEncryptionProvider();
    const provider = createPostgresPgcryptoRuntimeVaultProvider({ payloadRepository, encryptionProvider });

    const reference = fixtureReference();
    await payloadRepository.writeVersion(reference.id, await encryptionProvider.encrypt("valor-real-simulado"));

    const credential = await provider.resolveSecret(reference, { singleUse: true });
    expect(credential.use((v) => v)).toBe("valor-real-simulado");
  });

  it("supports() só reconhece vaultProvider 'postgres_pgcrypto'", () => {
    const provider = createPostgresPgcryptoRuntimeVaultProvider({
      payloadRepository: new InMemorySecretPayloadRepository(),
      encryptionProvider: new FakeSecretEncryptionProvider(),
    });
    expect(provider.supports("postgres_pgcrypto")).toBe(true);
    expect(provider.supports("in_memory")).toBe(false);
    expect(provider.supports("noop")).toBe(false);
    expect(provider.supports("database_placeholder")).toBe(false);
  });

  it("versão do payload divergente da metadata (stale reference) recusa fail-closed", async () => {
    const payloadRepository = new InMemorySecretPayloadRepository();
    const encryptionProvider = new FakeSecretEncryptionProvider();
    const provider = createPostgresPgcryptoRuntimeVaultProvider({ payloadRepository, encryptionProvider });

    const reference = fixtureReference({ version: 2 }); // metadata diz v2
    await payloadRepository.writeVersion(reference.id, await encryptionProvider.encrypt("v1-apenas")); // payload só tem v1

    await expect(provider.resolveSecret(reference, { singleUse: true })).rejects.toThrow(SecretVersionStaleError);
  });

  it("nenhum ciphertext ativo -> SecretResolutionFailedError, nunca resolve", async () => {
    const provider = createPostgresPgcryptoRuntimeVaultProvider({
      payloadRepository: new InMemorySecretPayloadRepository(),
      encryptionProvider: new FakeSecretEncryptionProvider(),
    });
    await expect(provider.resolveSecret(fixtureReference(), { singleUse: true })).rejects.toThrow(/secret_resolution_failed/);
  });

  it("ciphertext corrompido -> falha decifrando, nunca devolve valor parcial/adulterado", async () => {
    const payloadRepository = new InMemorySecretPayloadRepository();
    const encryptionProvider = new FakeSecretEncryptionProvider();
    const provider = createPostgresPgcryptoRuntimeVaultProvider({ payloadRepository, encryptionProvider });

    const reference = fixtureReference();
    await payloadRepository.writeVersion(reference.id, await encryptionProvider.encrypt("valor-integro"));
    encryptionProvider.corruptNextCiphertext();

    await expect(provider.resolveSecret(reference, { singleUse: true })).rejects.toThrow(/decrypt_failed/);
  });

  it("validateReference confirma versão ativa presente e consistente", async () => {
    const payloadRepository = new InMemorySecretPayloadRepository();
    const encryptionProvider = new FakeSecretEncryptionProvider();
    const provider = createPostgresPgcryptoRuntimeVaultProvider({ payloadRepository, encryptionProvider });
    const reference = fixtureReference();

    expect((await provider.validateReference(reference)).valid).toBe(false);

    await payloadRepository.writeVersion(reference.id, await encryptionProvider.encrypt("valor"));
    expect((await provider.validateReference(reference)).valid).toBe(true);
  });

  it("recordUsage é fire-and-forget — nunca bloqueia nem derruba resolveSecret mesmo se o callback lançar", async () => {
    const payloadRepository = new InMemorySecretPayloadRepository();
    const encryptionProvider = new FakeSecretEncryptionProvider();
    const recordUsage = vi.fn().mockRejectedValue(new Error("falha simulada no bump de uso"));
    const provider = createPostgresPgcryptoRuntimeVaultProvider({ payloadRepository, encryptionProvider, recordUsage });

    const reference = fixtureReference();
    await payloadRepository.writeVersion(reference.id, await encryptionProvider.encrypt("valor"));

    const credential = await provider.resolveSecret(reference, { singleUse: true });
    expect(credential.use((v) => v)).toBe("valor");
    // dá um tick pro `.catch()` interno rodar antes de checar a chamada
    await new Promise((r) => setTimeout(r, 0));
    expect(recordUsage).toHaveBeenCalledWith(reference.id);
  });

  it("healthPreview reflete a disponibilidade do encryption provider injetado", async () => {
    const provider = createPostgresPgcryptoRuntimeVaultProvider({
      payloadRepository: new InMemorySecretPayloadRepository(),
      encryptionProvider: new FakeSecretEncryptionProvider(),
    });
    const health = await provider.healthPreview();
    expect(health.id).toBe("postgres_pgcrypto");
    expect(health.available).toBe(true);
  });
});

describe("PostgresPgcryptoRuntimeVaultProvider — integrado ao runtime boundary (withProviderCredential)", () => {
  async function buildInstallation(controlPlaneRepos: Awaited<ReturnType<typeof createControlPlaneRepositories>>, demoTenant: ReturnType<typeof createDemoTenants>[number]) {
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
    const tenantWithManifest = { ...tenant, manifest: attached.tenant.manifest };
    const installation = await createPersistedInstallation(
      controlPlaneRepos,
      { slug: tenant.clientSlug, company: tenant.clientName, status: "provisioning", commercial: "contract", technical: "validated", tenant: tenantWithManifest },
      NOOP_CTX,
    );
    return { tenant, installation };
  }

  it("resolve com sucesso através do boundary completo (policy + lease + audit) usando o backend real plugado", async () => {
    const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps();
    const payloadRepository = new InMemorySecretPayloadRepository();
    const encryptionProvider = new FakeSecretEncryptionProvider();

    const registry = new RuntimeVaultProviderRegistry();
    registry.registerProvider(createPostgresPgcryptoRuntimeVaultProvider({ payloadRepository, encryptionProvider }));
    deps.vaultProviderRegistry = registry;

    const [demoTenant] = createDemoTenants();
    const { tenant, installation } = await buildInstallation(controlPlaneRepos, demoTenant!);

    const secretReference = await recordSecretReference(
      controlPlaneRepos,
      { installationId: installation.id, tenantId: tenant.id, reference: `ref-${randomUUID()}`, type: "api_key", provider: "supabase", vaultProvider: "postgres_pgcrypto", vaultKey: "control_plane_secret_ciphertexts" },
      NOOP_CTX,
    );
    await recordProviderConnection(
      controlPlaneRepos,
      { installationId: installation.id, provider: "supabase", mode: "dry_run", status: "available", config: {}, secretReferenceId: secretReference.id },
      NOOP_CTX,
    );
    await storeSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReference.id, "token-real-simulado-nunca-de-verdade", NOOP_CTX);

    const value = await withProviderCredential(
      deps,
      {
        tenantId: tenant.id,
        installationId: installation.id,
        provider: "supabase",
        secretReferenceId: secretReference.id,
        purpose: "api_call",
        operation: "project.read",
        requestedAt: new Date().toISOString(),
        correlationId: randomUUID(),
      },
      (credential) => credential.use((v) => v),
    );

    expect(value).toBe("token-real-simulado-nunca-de-verdade");
  });

  it("isolamento cross-tenant continua negado mesmo com o backend real plugado — política é reusada, não reimplementada", async () => {
    const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps();
    const payloadRepository = new InMemorySecretPayloadRepository();
    const encryptionProvider = new FakeSecretEncryptionProvider();
    const registry = new RuntimeVaultProviderRegistry();
    registry.registerProvider(createPostgresPgcryptoRuntimeVaultProvider({ payloadRepository, encryptionProvider }));
    deps.vaultProviderRegistry = registry;

    const [demoTenantA, demoTenantB] = createDemoTenants();
    const { tenant: tenantA, installation: installationA } = await buildInstallation(controlPlaneRepos, demoTenantA!);
    const { installation: installationB } = await buildInstallation(controlPlaneRepos, demoTenantB!);

    const secretReferenceA = await recordSecretReference(
      controlPlaneRepos,
      { installationId: installationA.id, tenantId: tenantA.id, reference: `ref-${randomUUID()}`, type: "api_key", provider: "supabase", vaultProvider: "postgres_pgcrypto", vaultKey: "control_plane_secret_ciphertexts" },
      NOOP_CTX,
    );
    await storeSecretValue(controlPlaneRepos, { payloadRepository, encryptionProvider }, secretReferenceA.id, "segredo-do-tenant-a", NOOP_CTX);
    await recordProviderConnection(
      controlPlaneRepos,
      { installationId: installationB.id, provider: "supabase", mode: "dry_run", status: "available", config: {}, secretReferenceId: secretReferenceA.id },
      NOOP_CTX,
    );

    await expect(
      withProviderCredential(
        deps,
        {
          tenantId: (await controlPlaneRepos.installations.findInstallation(installationB.id))!.tenant.id,
          installationId: installationB.id,
          provider: "supabase",
          secretReferenceId: secretReferenceA.id,
          purpose: "api_call",
          operation: "project.read",
          requestedAt: new Date().toISOString(),
          correlationId: randomUUID(),
        },
        (credential) => credential.use((v) => v),
      ),
    ).rejects.toThrow(ProviderCredentialAccessDeniedError);
  });
});

describe("createRealVaultBackendRuntimeVaultProvider — fábrica de composição", () => {
  it("monta um provider funcional a partir de peças injetadas (nunca toca Supabase real neste teste)", async () => {
    const controlPlaneRepos = await createControlPlaneRepositories("memory");
    const payloadRepository = new InMemorySecretPayloadRepository();
    const encryptionProvider = new FakeSecretEncryptionProvider();

    const provider = createRealVaultBackendRuntimeVaultProvider(controlPlaneRepos, { payloadRepository, encryptionProvider });
    expect(provider.id).toBe("postgres_pgcrypto");

    const reference = fixtureReference();
    await payloadRepository.writeVersion(reference.id, await encryptionProvider.encrypt("valor-via-fabrica"));
    const credential = await provider.resolveSecret(reference, { singleUse: true });
    expect(credential.use((v) => v)).toBe("valor-via-fabrica");
  });
});
