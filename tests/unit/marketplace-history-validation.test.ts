import { describe, expect, it } from "vitest";

import { filterHistoryByModule, filterHistoryByTenant, recordHistoryEntry, sortHistoryChronological } from "@/lib/marketplace/history";
import { validateMarketplaceOffer, validateModuleLicense, validateModuleTrial } from "@/lib/marketplace/validation";
import type { MarketplaceOffer, ModuleLicense, ModuleTrial } from "@/lib/marketplace/types";

describe("history", () => {
  it("recordHistoryEntry monta uma entrada com occurredAt default", () => {
    const entry = recordHistoryEntry({ id: "h1", tenantId: "t1", installationId: "i1", moduleId: "core.crm", type: "license_created", message: "criada" });
    expect(entry.id).toBe("h1");
    expect(entry.occurredAt).toBeTruthy();
  });

  it("filterHistoryByModule / filterHistoryByTenant filtram corretamente", () => {
    const entries = [
      recordHistoryEntry({ id: "h1", tenantId: "t1", installationId: "i1", moduleId: "core.crm", type: "license_created", message: "x", now: "2026-01-01T00:00:00.000Z" }),
      recordHistoryEntry({ id: "h2", tenantId: "t2", installationId: "i1", moduleId: "ai.agents", type: "license_created", message: "x", now: "2026-01-02T00:00:00.000Z" }),
    ];
    expect(filterHistoryByModule(entries, "core.crm").map((e) => e.id)).toEqual(["h1"]);
    expect(filterHistoryByTenant(entries, "t2").map((e) => e.id)).toEqual(["h2"]);
  });

  it("sortHistoryChronological ordena por occurredAt crescente", () => {
    const entries = [
      recordHistoryEntry({ id: "h2", tenantId: "t1", installationId: "i1", moduleId: "core.crm", type: "license_renewed", message: "x", now: "2026-02-01T00:00:00.000Z" }),
      recordHistoryEntry({ id: "h1", tenantId: "t1", installationId: "i1", moduleId: "core.crm", type: "license_created", message: "x", now: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(sortHistoryChronological(entries).map((e) => e.id)).toEqual(["h1", "h2"]);
  });
});

const BASE_LICENSE: ModuleLicense = {
  id: "l1",
  tenantId: "t1",
  installationId: "i1",
  moduleId: "ai.agents",
  status: "active",
  source: "paid_addon",
  startsAt: "2026-01-01T00:00:00.000Z",
  billingSubscriptionId: "sub-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("validateModuleLicense", () => {
  it("licença válida não produz erro", () => {
    expect(validateModuleLicense(BASE_LICENSE)).toEqual([]);
  });

  it("endsAt anterior a startsAt é erro", () => {
    const errors = validateModuleLicense({ ...BASE_LICENSE, endsAt: "2025-01-01T00:00:00.000Z" });
    expect(errors.some((e) => e.field === "endsAt")).toBe(true);
  });

  it("licença paid_addon sem referência de billing é erro", () => {
    const errors = validateModuleLicense({ ...BASE_LICENSE, billingSubscriptionId: undefined, billingItemId: undefined });
    expect(errors.some((e) => e.field === "billingSubscriptionId")).toBe(true);
  });

  it("licença bundle sem bundleId é erro", () => {
    const errors = validateModuleLicense({ ...BASE_LICENSE, source: "bundle", bundleId: undefined });
    expect(errors.some((e) => e.field === "bundleId")).toBe(true);
  });
});

const BASE_TRIAL: ModuleTrial = {
  id: "t1",
  tenantId: "t1",
  installationId: "i1",
  moduleId: "channel.whatsapp",
  status: "active",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2026-01-15T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("validateModuleTrial", () => {
  it("trial válido não produz erro", () => {
    expect(validateModuleTrial(BASE_TRIAL)).toEqual([]);
  });

  it("endsAt <= startsAt é erro", () => {
    const errors = validateModuleTrial({ ...BASE_TRIAL, endsAt: BASE_TRIAL.startsAt });
    expect(errors.some((e) => e.field === "endsAt")).toBe(true);
  });

  it("trial converted sem convertedLicenseId é erro", () => {
    const errors = validateModuleTrial({ ...BASE_TRIAL, status: "converted", convertedLicenseId: undefined });
    expect(errors.some((e) => e.field === "convertedLicenseId")).toBe(true);
  });
});

const BASE_OFFER: MarketplaceOffer = {
  id: "o1",
  name: "Oferta X",
  type: "module",
  moduleIds: ["core.crm"],
  deploymentPlans: ["lite"],
  recurring: false,
  status: "active",
  enabled: true,
  visibility: "public",
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("validateMarketplaceOffer", () => {
  it("oferta válida não produz erro", () => {
    expect(validateMarketplaceOffer(BASE_OFFER)).toEqual([]);
  });

  it("oferta sem moduleIds/deploymentPlans é erro", () => {
    const errors = validateMarketplaceOffer({ ...BASE_OFFER, moduleIds: [], deploymentPlans: [] });
    expect(errors.some((e) => e.field === "moduleIds")).toBe(true);
    expect(errors.some((e) => e.field === "deploymentPlans")).toBe(true);
  });

  it("oferta private sem eligibleTenantIds é erro", () => {
    const errors = validateMarketplaceOffer({ ...BASE_OFFER, visibility: "private", eligibleTenantIds: undefined });
    expect(errors.some((e) => e.field === "eligibleTenantIds")).toBe(true);
  });
});
