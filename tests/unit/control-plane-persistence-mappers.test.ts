import { describe, expect, it } from "vitest";

import {
  tenantDomainToInsertRow,
  tenantRowToDomain,
  type ControlPlaneTenantRow,
} from "@/lib/control-plane-persistence/mappers/tenant";
import {
  deploymentDomainToInsertRow,
  deploymentRowToDomain,
  operationEventDomainToInsertRow,
  operationEventRowToDomain,
  provisioningRunDomainToInsertRow,
  provisioningRunRowToDomain,
  provisioningStepDomainToUpsertRow,
  provisioningStepRowToDomain,
  providerConnectionDomainToUpsertRow,
  providerConnectionRowToDomain,
  secretReferenceDomainToInsertRow,
  secretReferenceRowToMetadata,
} from "@/lib/control-plane-persistence/mappers/persistence";
import type { TenantCreateInput } from "@/lib/tenants/repository";

const TENANT_INPUT: TenantCreateInput = {
  clientName: "Empresa Teste",
  clientSlug: "empresa-teste",
  domain: "crm.empresa-teste.com.br",
  plan: "lite",
  requestedModules: ["core.contacts"],
  enabledModules: ["core.contacts"],
  branding: { appName: "Empresa Teste" },
  commercialStatus: "onboarding",
  technicalStatus: "configuration_pending",
};

describe("mapper de tenant", () => {
  it("domain -> insert row nunca inclui id/timestamps/manifest", () => {
    const row = tenantDomainToInsertRow(TENANT_INPUT);
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("manifest");
    expect(row.client_slug).toBe("empresa-teste");
    expect(row.commercial_status).toBe("onboarding");
  });

  it("row -> domain reconstrói Tenant sem snake_case vazando", () => {
    const row: ControlPlaneTenantRow = {
      id: "t-1",
      client_slug: "empresa-teste",
      client_name: "Empresa Teste",
      legal_name: null,
      domain: "crm.empresa-teste.com.br",
      plan: "lite",
      requested_modules: ["core.contacts"],
      enabled_modules: ["core.contacts"],
      branding: { appName: "Empresa Teste" },
      commercial_status: "onboarding",
      technical_status: "configuration_pending",
      primary_contact: null,
      account_manager: null,
      infrastructure: null,
      supabase_ref: null,
      notes: null,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    };
    const tenant = tenantRowToDomain(row);
    expect(tenant.id).toBe("t-1");
    expect(tenant.clientSlug).toBe("empresa-teste");
    expect(tenant.manifest).toBeUndefined();
    expect((tenant as Record<string, unknown>).client_slug).toBeUndefined();
  });
});

describe("mapper de deployment", () => {
  it("round-trip domain -> insert row -> row -> domain preserva dados", () => {
    const insertRow = deploymentDomainToInsertRow({
      installationId: "inst-1",
      tenantId: "t-1",
      target: "vercel",
      plan: "pro",
      manifestFingerprint: "fp-123",
      manifestSnapshot: { plan: "pro" },
      generatedAt: "2026-08-01T00:00:00.000Z",
    });
    const domain = deploymentRowToDomain({ id: "d-1", created_at: "2026-08-01T00:00:00.000Z", ...insertRow });
    expect(domain.installationId).toBe("inst-1");
    expect(domain.manifestFingerprint).toBe("fp-123");
    expect(domain.manifestSnapshot).toEqual({ plan: "pro" });
  });
});

describe("mapper de provisioning run/step", () => {
  it("run: domain -> row -> domain preserva status/blockers", () => {
    const insertRow = provisioningRunDomainToInsertRow({
      installationId: "inst-1",
      tenantId: "t-1",
      plan: "dedicated",
      target: "vps",
      manifestFingerprint: "fp-1",
      status: "running",
      blockers: ["x"],
      warnings: [],
    });
    const domain = provisioningRunRowToDomain({ id: "r-1", created_at: "now", updated_at: "now", ...insertRow });
    expect(domain.status).toBe("running");
    expect(domain.blockers).toEqual(["x"]);
  });

  it("step: upsert row usa null (não undefined) pra campos ausentes", () => {
    const row = provisioningStepDomainToUpsertRow({
      runId: "r-1",
      stepId: "database_provision",
      category: "database",
      status: "pending",
      blockers: [],
      warnings: [],
      attempts: 0,
    });
    expect(row.started_at).toBeNull();
    expect(row.completed_at).toBeNull();
  });

  it("step: row -> domain preserva stepId/category", () => {
    const domain = provisioningStepRowToDomain({
      id: "s-1",
      run_id: "r-1",
      step_id: "database_provision",
      category: "database",
      status: "completed",
      blockers: [],
      warnings: [],
      started_at: null,
      completed_at: null,
      attempts: 1,
      created_at: "now",
      updated_at: "now",
    });
    expect(domain.stepId).toBe("database_provision");
    expect(domain.startedAt).toBeUndefined();
  });
});

describe("mapper de provider connection", () => {
  it("nunca inclui campo de segredo — só config sanitizada", () => {
    const row = providerConnectionDomainToUpsertRow({
      installationId: "inst-1",
      provider: "supabase",
      mode: "dry_run",
      status: "available",
      config: { region: "sa-east-1" },
    });
    expect(row.config).toEqual({ region: "sa-east-1" });
    expect(row).not.toHaveProperty("token");
    const domain = providerConnectionRowToDomain({ id: "c-1", created_at: "now", updated_at: "now", ...row });
    expect(domain.provider).toBe("supabase");
  });
});

describe("mapper de secret reference", () => {
  it("insert row nunca tem coluna de valor de segredo — só reference/vault_key opaco", () => {
    const row = secretReferenceDomainToInsertRow({
      reference: "ref-1",
      type: "api_key",
      provider: "supabase",
      vaultProvider: "in_memory",
      vaultKey: "placeholder/abc",
    });
    expect(Object.keys(row).sort()).toEqual(
      ["installation_id", "provider", "reference", "status", "tenant_id", "type", "vault_key", "vault_provider", "version"].sort(),
    );
    const metadata = secretReferenceRowToMetadata({ id: "sr-1", created_at: "now", updated_at: "now", rotated_at: null, revoked_at: null, ...row });
    expect(metadata.vaultKey).toBe("placeholder/abc");
    expect(metadata.status).toBe("active");
  });
});

describe("mapper de operation event", () => {
  it("preserva eventType como string aberta (vocabulário não fechado)", () => {
    const row = operationEventDomainToInsertRow({
      eventType: "algum.evento.futuro.nunca.visto",
      severity: "info",
      message: "msg",
      metadata: {},
      occurredAt: "2026-08-01T00:00:00.000Z",
    });
    const domain = operationEventRowToDomain({ id: "e-1", created_at: "now", ...row });
    expect(domain.eventType).toBe("algum.evento.futuro.nunca.visto");
  });
});
