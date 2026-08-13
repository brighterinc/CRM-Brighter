import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateDeploymentManifest } from "@/lib/deployment";
import {
  createPersistedInstallation,
  createPersistedTenant,
  recordProviderConnection,
  recordSecretReference,
  type ControlPlaneActorContext,
} from "@/lib/control-plane-persistence/services";
import { createDemoTenants } from "@/lib/tenants/repository";
import { attachDeploymentManifest } from "@/lib/tenants/validation";

import { createInMemoryAuditSink } from "@/lib/provider-credentials-runtime/audit";
import { CredentialEscapeAttemptError, ProviderCredentialAccessDeniedError } from "@/lib/provider-credentials-runtime/errors";
import { createInMemoryProviderCredentialsRuntimeDeps } from "@/lib/provider-credentials-runtime/factory";
import { InMemoryRuntimeVaultProvider } from "@/lib/provider-credentials-runtime/providers";
import { withProviderCredential } from "@/lib/provider-credentials-runtime/runtime";
import type { ProviderCredentialRequest } from "@/lib/provider-credentials-runtime/types";

const NOOP_CTX: ControlPlaneActorContext = { emitAudit: async () => {} };
const SECRET_VALUE = "the-actual-secret-value-never-should-appear";

async function buildFixture() {
  const { deps, controlPlaneRepos } = await createInMemoryProviderCredentialsRuntimeDeps();
  const { sink, events } = createInMemoryAuditSink();
  deps.auditSink = sink;

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
    {
      slug: tenant.clientSlug,
      company: tenant.clientName,
      status: "provisioning",
      commercial: "contract",
      technical: "validated",
      tenant: { ...tenant, manifest: attached.tenant.manifest },
    },
    NOOP_CTX,
  );
  const secretReference = await recordSecretReference(
    controlPlaneRepos,
    {
      installationId: installation.id,
      tenantId: tenant.id,
      reference: `test-${randomUUID()}`,
      type: "api_key",
      provider: "fake",
      vaultProvider: "in_memory",
      vaultKey: "test/key",
    },
    NOOP_CTX,
  );
  await recordProviderConnection(
    controlPlaneRepos,
    {
      installationId: installation.id,
      provider: "fake",
      mode: "dry_run",
      status: "available",
      config: {},
      secretReferenceId: secretReference.id,
    },
    NOOP_CTX,
  );

  const inMemoryProvider = deps.vaultProviderRegistry.findProvider("in_memory") as InMemoryRuntimeVaultProvider;
  inMemoryProvider.seed(secretReference.id, SECRET_VALUE);

  const request: ProviderCredentialRequest = {
    tenantId: tenant.id,
    installationId: installation.id,
    provider: "fake",
    secretReferenceId: secretReference.id,
    purpose: "api_call",
    operation: "simulate",
    requestedBy: "test-user",
    requestedAt: new Date().toISOString(),
    correlationId: randomUUID(),
    singleUse: true,
  };

  return { deps, controlPlaneRepos, tenant, installation, secretReference, request, events };
}

describe("withProviderCredential — caminho feliz", () => {
  it("resolve a credencial, executa o callback, libera a lease, audita sem vazar o valor", async () => {
    const { deps, request, events } = await buildFixture();

    const result = await withProviderCredential(deps, request, (credential) => credential.use((v) => v.length));
    expect(result).toBe(SECRET_VALUE.length);

    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toEqual([
      "credential_access_requested",
      "credential_lease_created",
      "credential_resolved",
      "credential_consumed",
      "credential_released",
    ]);

    for (const event of events) {
      expect(JSON.stringify(event)).not.toContain(SECRET_VALUE);
    }

    const leases = await deps.leaseRepository.listByInstallation(request.installationId);
    expect(leases[0]?.status).toBe("released");
  });

  it("nunca escreve no console (sem console.log/error acidental de valor)", async () => {
    const { deps, request } = await buildFixture();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await withProviderCredential(deps, request, (credential) => credential.use((v) => v));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("withProviderCredential — tentativa de escape", () => {
  it("lança CredentialEscapeAttemptError se o callback retorna o ResolvedCredential diretamente", async () => {
    const { deps, request } = await buildFixture();
    await expect(withProviderCredential(deps, request, (credential) => credential as unknown as string)).rejects.toThrow(
      CredentialEscapeAttemptError,
    );
  });

  it("lança CredentialEscapeAttemptError se o callback embute o ResolvedCredential num objeto de retorno", async () => {
    const { deps, request } = await buildFixture();
    await expect(
      withProviderCredential(deps, request, (credential) => ({ wrapped: { deeper: credential } }) as unknown as string),
    ).rejects.toThrow(CredentialEscapeAttemptError);
  });

  it("a lease termina em 'failed' quando a tentativa de escape é bloqueada", async () => {
    const { deps, request } = await buildFixture();
    await expect(withProviderCredential(deps, request, (credential) => credential as unknown as string)).rejects.toThrow();
    const leases = await deps.leaseRepository.listByInstallation(request.installationId);
    expect(leases[0]?.status).toBe("failed");
  });
});

describe("withProviderCredential — negação e falha", () => {
  it("nega acesso pra secretReferenceId inexistente e nunca cria lease", async () => {
    const { deps, request } = await buildFixture();
    const badRequest = { ...request, secretReferenceId: randomUUID() };
    await expect(withProviderCredential(deps, badRequest, (c) => c.use((v) => v))).rejects.toThrow(ProviderCredentialAccessDeniedError);
    const leases = await deps.leaseRepository.listByInstallation(request.installationId);
    expect(leases).toHaveLength(0);
  });

  it("propaga o erro do callback e ainda assim libera a lease (release-on-error)", async () => {
    const { deps, request } = await buildFixture();
    await expect(
      withProviderCredential(deps, request, () => {
        throw new Error("falha intencional de operação");
      }),
    ).rejects.toThrow("falha intencional de operação");

    const leases = await deps.leaseRepository.listByInstallation(request.installationId);
    expect(leases[0]?.status).toBe("failed");
  });

  it("credencial é liberada (buffer zerado) mesmo quando o callback lança", async () => {
    const { deps, request } = await buildFixture();
    let capturedCredential: { released: boolean } | undefined;
    await expect(
      withProviderCredential(deps, request, (credential) => {
        capturedCredential = credential;
        throw new Error("falha intencional");
      }),
    ).rejects.toThrow();
    expect(capturedCredential?.released).toBe(true);
  });
});
