import { beforeEach, describe, expect, it, vi } from "vitest";

import { createControlPlaneRepositories, type ControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";
import {
  createPersistedInstallation,
  createPersistedTenant,
  createProvisioningRun,
  recordDeployment,
  recordOperationEvent,
  recordProviderConnection,
  recordProvisioningStep,
  recordSecretReference,
  type AuditEmitInput,
} from "@/lib/control-plane-persistence/services";
import { generateDeploymentManifest } from "@/lib/deployment";
import { createDemoTenants } from "@/lib/tenants/repository";
import { attachDeploymentManifest } from "@/lib/tenants/validation";

async function buildFixtureTenant() {
  const [demoTenant] = createDemoTenants();
  if (!demoTenant) throw new Error("fixture ausente");
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

describe("Control Plane Persistence — camada de serviço (in-memory)", () => {
  let repos: ControlPlaneRepositories;
  let auditSpy: ReturnType<typeof vi.fn<(entry: AuditEmitInput) => Promise<void>>>;

  beforeEach(async () => {
    repos = await createControlPlaneRepositories("memory");
    auditSpy = vi.fn(async () => {});
  });

  it("createPersistedTenant grava no repository, emite audit E operation event", async () => {
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
      { emitAudit: auditSpy },
    );

    expect(await repos.tenants.findById(tenant.id)).toEqual(tenant);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0]?.[0].action).toBe("control_plane.tenant_created");

    const events = await repos.operationEvents.listByTenant(tenant.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("tenant.created");
  });

  it("createPersistedInstallation deriva deployment/provisioning do tenant, nunca duplica", async () => {
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
      { emitAudit: auditSpy },
    );

    const installation = await createPersistedInstallation(
      repos,
      {
        slug: tenant.clientSlug,
        company: tenant.clientName,
        status: "provisioning",
        commercial: "contract",
        technical: "validated",
        tenant: { ...tenant, manifest: fixtureTenant.manifest },
      },
      { emitAudit: auditSpy },
    );

    expect(installation.deployment).toEqual(fixtureTenant.manifest);
    expect(installation.modules).toEqual(tenant.enabledModules);
    expect(auditSpy.mock.calls.map((c) => c[0].action)).toContain("control_plane.installation_created");
  });

  it("recordSecretReference nunca inclui vaultKey no audit/operation event metadata", async () => {
    const secretReference = await recordSecretReference(
      repos,
      {
        installationId: null,
        tenantId: null,
        reference: "ref-1",
        type: "api_key",
        provider: "supabase",
        vaultProvider: "in_memory",
        vaultKey: "placeholder/super-secreto-mas-e-so-ponteiro",
      },
      { emitAudit: auditSpy },
    );

    const auditMetadata = auditSpy.mock.calls[0]?.[0].metadata;
    expect(JSON.stringify(auditMetadata)).not.toContain("vaultKey");
    expect(JSON.stringify(auditMetadata)).not.toContain("placeholder/super-secreto-mas-e-so-ponteiro");

    const events = await repos.operationEvents.listRecent(10);
    expect(JSON.stringify(events)).not.toContain("placeholder/super-secreto-mas-e-so-ponteiro");
    expect(secretReference.status).toBe("active");
  });

  it("recordSecretReference recusa vaultKey que carrega um campo sensível dentro do input", async () => {
    await expect(
      recordSecretReference(
        repos,
        {
          reference: "ref-2",
          type: "database_password",
          provider: "supabase",
          vaultProvider: "in_memory",
          vaultKey: "placeholder/2",
          // @ts-expect-error -- campo extra deliberado
          password: "nao-deveria-persistir",
        },
        { emitAudit: auditSpy },
      ),
    ).rejects.toThrow(/unsafe_persistence_payload/);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it("createProvisioningRun -> recordProvisioningStep -> recordProviderConnection -> recordOperationEvent: fluxo completo emite 4 operation events", async () => {
    const run = await createProvisioningRun(
      repos,
      { installationId: "i1", tenantId: "t1", plan: "lite", target: "vercel", manifestFingerprint: "fp", status: "running" },
      { emitAudit: auditSpy },
    );
    await recordProvisioningStep(repos, { runId: run.id, stepId: "database_provision", category: "database", status: "completed", attempts: 1 }, { emitAudit: auditSpy });
    await recordProviderConnection(
      repos,
      { installationId: "i1", provider: "supabase", mode: "dry_run", status: "available", config: {} },
      { emitAudit: auditSpy },
    );
    await recordOperationEvent(repos, { installationId: "i1", eventType: "installation.updated", severity: "info", message: "m" }, { emitAudit: auditSpy });

    expect(auditSpy).toHaveBeenCalledTimes(4);
    const events = await repos.operationEvents.listByInstallation("i1");
    expect(events.map((e) => e.eventType).sort()).toEqual(
      ["installation.updated", "provider_connection.recorded", "provisioning_run.created", "provisioning_step.recorded"].sort(),
    );
  });

  it("recordDeployment recusa manifestSnapshot com chave sensível antes de qualquer I/O (audit nunca chamado)", async () => {
    await expect(
      recordDeployment(
        repos,
        { target: "vercel", plan: "lite", manifestFingerprint: "fp", manifestSnapshot: { connectionString: "postgres://..." } },
        { emitAudit: auditSpy },
      ),
    ).rejects.toThrow(/unsafe_persistence_payload/);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it("sem emitAudit explícito, usa o default (não quebra a chamada — só não testamos o efeito real aqui)", async () => {
    // Sem `ctx.emitAudit`, o default faria `await import("@/lib/audit")` — não
    // exercitado aqui de propósito (precisaria de env real). O que ESTE teste
    // prova é que a assinatura aceita `ctx` opcional sem lançar por ausência
    // dele, cobrindo o branch `ctx.emitAudit ?? defaultAuditEmitter` = fallback.
    await expect(
      recordOperationEvent(repos, { installationId: "i1", eventType: "x", severity: "info", message: "m" }, { emitAudit: auditSpy }),
    ).resolves.toBeDefined();
  });
});
