import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";
import { createPersistedInstallation, createPersistedTenant, recordSecretReference, type ControlPlaneActorContext } from "@/lib/control-plane-persistence/services";
import { generateDeploymentManifest } from "@/lib/deployment";
import { createDemoTenants } from "@/lib/tenants/repository";
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import { FakeSecretEncryptionProvider } from "@/lib/control-plane-persistence/vault/encryption-fake";
import { InMemorySecretPayloadRepository } from "@/lib/control-plane-persistence/vault/secret-payload";
import { recordSecretUsage, revokeSecretValue, rotateSecretValue, storeSecretValue } from "@/lib/control-plane-persistence/vault/secret-value-service";
import { VaultReferenceNotFoundError } from "@/lib/control-plane-persistence/vault/types";

const NOOP_CTX: ControlPlaneActorContext = { emitAudit: async () => {} };

async function buildFixture() {
  const controlPlaneRepos = await createControlPlaneRepositories("memory");
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
  const tenantWithManifest = { ...tenant, manifest: attached.tenant.manifest };
  const installation = await createPersistedInstallation(
    controlPlaneRepos,
    { slug: tenant.clientSlug, company: tenant.clientName, status: "provisioning", commercial: "contract", technical: "validated", tenant: tenantWithManifest },
    NOOP_CTX,
  );

  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    { installationId: installation.id, tenantId: tenant.id, reference: `ref-${randomUUID()}`, type: "api_key", provider: "supabase", vaultProvider: "postgres_pgcrypto", vaultKey: "control_plane_secret_ciphertexts" },
    NOOP_CTX,
  );

  const payloadRepository = new InMemorySecretPayloadRepository();
  const encryptionProvider = new FakeSecretEncryptionProvider();

  return { controlPlaneRepos, tenant, installation, secretReference, deps: { payloadRepository, encryptionProvider } };
}

describe("secret-value-service — storeSecretValue", () => {
  it("cria a versão 1 e mantém reference.version em 1 (não é rotação)", async () => {
    const { controlPlaneRepos, secretReference, deps } = await buildFixture();
    const version = await storeSecretValue(controlPlaneRepos, deps, secretReference.id, "valor-inicial", NOOP_CTX);
    expect(version.version).toBe(1);

    const metadata = await controlPlaneRepos.vault.resolveReferenceMetadata(secretReference.id);
    expect(metadata?.version).toBe(1);
    expect(metadata?.rotatedAt).toBeUndefined();
  });

  it("reference inexistente lança VaultReferenceNotFoundError — nunca cria ciphertext órfão", async () => {
    const { deps } = await buildFixture();
    await expect(storeSecretValue(await createControlPlaneRepositories("memory"), deps, randomUUID(), "valor", NOOP_CTX)).rejects.toThrow(
      VaultReferenceNotFoundError,
    );
  });

  it("emite audit e operation event SEM o plaintext em nenhum campo (error/audit sanitization)", async () => {
    const { controlPlaneRepos, secretReference, deps } = await buildFixture();
    const auditEvents: unknown[] = [];
    await storeSecretValue(controlPlaneRepos, deps, secretReference.id, "SEGREDO-QUE-NUNCA-PODE-VAZAR", {
      emitAudit: async (entry) => {
        auditEvents.push(entry);
      },
    });

    const events = await controlPlaneRepos.operationEvents.listByInstallation(secretReference.installationId!);
    const serializedEvents = JSON.stringify(events);
    const serializedAudit = JSON.stringify(auditEvents);
    expect(serializedEvents).not.toContain("SEGREDO-QUE-NUNCA-PODE-VAZAR");
    expect(serializedAudit).not.toContain("SEGREDO-QUE-NUNCA-PODE-VAZAR");
  });

  it("nunca persiste plaintext — o ciphertext salvo é diferente do valor original", async () => {
    const { controlPlaneRepos, secretReference, deps } = await buildFixture();
    await storeSecretValue(controlPlaneRepos, deps, secretReference.id, "plaintext-original", NOOP_CTX);
    const stored = await deps.payloadRepository.getActiveCiphertext(secretReference.id);
    expect(stored?.ciphertext.toString("utf8")).not.toContain("plaintext-original");
  });
});

describe("secret-value-service — rotateSecretValue", () => {
  it("supersede a versão anterior, ativa a nova, e bump version/rotatedAt na metadata", async () => {
    const { controlPlaneRepos, secretReference, deps } = await buildFixture();
    await storeSecretValue(controlPlaneRepos, deps, secretReference.id, "valor-v1", NOOP_CTX);

    const { reference, version } = await rotateSecretValue(controlPlaneRepos, deps, secretReference.id, "valor-v2", NOOP_CTX);

    expect(version.version).toBe(2);
    expect(reference.version).toBe(2);
    expect(reference.rotatedAt).toBeDefined();

    const active = await deps.payloadRepository.getActiveCiphertext(secretReference.id);
    expect(active?.version).toBe(2);
    expect(await deps.encryptionProvider.decrypt(active!)).toBe("valor-v2");
  });
});

describe("secret-value-service — revokeSecretValue", () => {
  it("marca reference revogada E ciphertext ativo revogado — nada resolve depois", async () => {
    const { controlPlaneRepos, secretReference, deps } = await buildFixture();
    await storeSecretValue(controlPlaneRepos, deps, secretReference.id, "valor", NOOP_CTX);

    const revoked = await revokeSecretValue(controlPlaneRepos, deps, secretReference.id, NOOP_CTX);
    expect(revoked.status).toBe("revoked");
    expect(await deps.payloadRepository.getActiveCiphertext(secretReference.id)).toBeNull();

    const validation = await controlPlaneRepos.vault.validateReference(secretReference.id);
    expect(validation.valid).toBe(false);
  });
});

describe("secret-value-service — recordSecretUsage", () => {
  it("bump de lastUsedAt via recordUsage — nunca lança mesmo pra id inexistente", async () => {
    const { controlPlaneRepos, secretReference } = await buildFixture();
    await expect(recordSecretUsage(controlPlaneRepos, randomUUID())).resolves.toBeUndefined();

    await recordSecretUsage(controlPlaneRepos, secretReference.id);
    const metadata = await controlPlaneRepos.vault.resolveReferenceMetadata(secretReference.id);
    expect(metadata?.lastUsedAt).toBeDefined();
  });
});
