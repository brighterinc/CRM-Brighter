import { describe, expect, it } from "vitest";

import { createDemoBundles, createDemoLicenses, createDemoOffers, InMemoryMarketplaceRepository } from "@/lib/marketplace/repository";
import { buildMarketplaceCatalog } from "@/lib/marketplace/catalog";
import type { ModuleLicense } from "@/lib/marketplace/types";

describe("InMemoryMarketplaceRepository", () => {
  it("save/find/list de licença funcionam e cada instância começa vazia", async () => {
    const repo = new InMemoryMarketplaceRepository();
    const license: ModuleLicense = {
      id: "l1",
      tenantId: "t1",
      installationId: "i1",
      moduleId: "ai.agents",
      status: "active",
      source: "paid_addon",
      startsAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await repo.saveLicense(license);
    expect(await repo.findLicense("l1")).toEqual(license);
    expect(await repo.findLicense("inexistente")).toBeNull();
    expect(await repo.listLicenses("t1")).toEqual([license]);
    expect(await repo.listLicenses("t2")).toEqual([]);

    const otherRepo = new InMemoryMarketplaceRepository();
    expect(await otherRepo.listLicenses()).toEqual([]);
  });

  it("save/find/list de trial, oferta, bundle e histórico funcionam", async () => {
    const repo = new InMemoryMarketplaceRepository();
    await repo.saveTrial({
      id: "tr1",
      tenantId: "t1",
      installationId: "i1",
      moduleId: "channel.whatsapp",
      status: "active",
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-01-15T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(await repo.findTrial("tr1")).not.toBeNull();
    expect((await repo.listTrials("t1")).length).toBe(1);

    const [offer] = createDemoOffers();
    await repo.saveOffer(offer!);
    expect(await repo.findOffer(offer!.id)).toEqual(offer);

    const [bundle] = createDemoBundles();
    await repo.saveBundle(bundle!);
    expect(await repo.findBundle(bundle!.id)).toEqual(bundle);

    const entry = await repo.saveHistoryEntry({ id: "h1", tenantId: "t1", installationId: "i1", moduleId: "core.crm", type: "license_created", occurredAt: "2026-01-01T00:00:00.000Z", message: "x" });
    expect((await repo.listHistory("t1"))).toEqual([entry]);
  });

  it("constructor com seed popula o repositório imediatamente", async () => {
    const catalog = buildMarketplaceCatalog();
    const repo = new InMemoryMarketplaceRepository({ modules: catalog });
    expect((await repo.listMarketplaceModules()).length).toBe(catalog.length);
  });
});

describe("createDemoOffers / createDemoLicenses", () => {
  it("createDemoOffers só inclui módulos públicos habilitados do catálogo", () => {
    const offers = createDemoOffers();
    expect(offers.every((o) => o.visibility === "public" && o.enabled)).toBe(true);
    expect(offers.some((o) => o.moduleIds.includes("automation.campaigns"))).toBe(false);
  });

  it("createDemoLicenses produz 1 licença active de core.crm por instalação", () => {
    const licenses = createDemoLicenses();
    expect(licenses.length).toBeGreaterThan(0);
    expect(licenses.every((l) => l.moduleId === "core.crm" && l.status === "active")).toBe(true);
  });
});
