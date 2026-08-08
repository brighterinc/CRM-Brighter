/**
 * Repositório abstrato — spec §14. `InMemoryMarketplaceRepository` é a única
 * implementação desta etapa — DEMONSTRAÇÃO/TESTE, não produção: sem tabela,
 * sem migration, sem Supabase real (mesma doutrina de
 * `InMemoryBillingRepository`/`InMemoryOutreachRepository`). Cada instância
 * começa vazia — nunca singleton global mutável da aplicação.
 */
import { createDemoInstallations } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";

import { buildMarketplaceCatalog } from "./catalog";
import { createDemoBundles } from "./bundles";
import type {
  MarketplaceBundle,
  MarketplaceModuleDefinition,
  MarketplaceOffer,
  ModuleLicense,
  ModuleLicenseHistoryEntry,
  ModuleTrial,
} from "./types";

export class MarketplaceEntityNotFoundError extends Error {
  constructor(
    public readonly entity: "module" | "offer" | "bundle" | "license" | "trial",
    public readonly id: string,
  ) {
    super(`marketplace_${entity}_not_found: ${id}`);
    this.name = "MarketplaceEntityNotFoundError";
  }
}

export interface MarketplaceRepository {
  saveMarketplaceModule(module: MarketplaceModuleDefinition): Promise<MarketplaceModuleDefinition>;
  findMarketplaceModule(id: string): Promise<MarketplaceModuleDefinition | null>;
  listMarketplaceModules(): Promise<MarketplaceModuleDefinition[]>;

  saveOffer(offer: MarketplaceOffer): Promise<MarketplaceOffer>;
  findOffer(id: string): Promise<MarketplaceOffer | null>;
  listOffers(): Promise<MarketplaceOffer[]>;

  saveBundle(bundle: MarketplaceBundle): Promise<MarketplaceBundle>;
  findBundle(id: string): Promise<MarketplaceBundle | null>;
  listBundles(): Promise<MarketplaceBundle[]>;

  saveLicense(license: ModuleLicense): Promise<ModuleLicense>;
  findLicense(id: string): Promise<ModuleLicense | null>;
  listLicenses(tenantId?: string): Promise<ModuleLicense[]>;

  saveTrial(trial: ModuleTrial): Promise<ModuleTrial>;
  findTrial(id: string): Promise<ModuleTrial | null>;
  listTrials(tenantId?: string): Promise<ModuleTrial[]>;

  saveHistoryEntry(entry: ModuleLicenseHistoryEntry): Promise<ModuleLicenseHistoryEntry>;
  listHistory(tenantId?: string): Promise<ModuleLicenseHistoryEntry[]>;
}

export class InMemoryMarketplaceRepository implements MarketplaceRepository {
  private readonly modules = new Map<string, MarketplaceModuleDefinition>();
  private readonly offers = new Map<string, MarketplaceOffer>();
  private readonly bundles = new Map<string, MarketplaceBundle>();
  private readonly licenses = new Map<string, ModuleLicense>();
  private readonly trials = new Map<string, ModuleTrial>();
  private readonly history: ModuleLicenseHistoryEntry[] = [];

  constructor(
    seed: {
      modules?: MarketplaceModuleDefinition[];
      offers?: MarketplaceOffer[];
      bundles?: MarketplaceBundle[];
      licenses?: ModuleLicense[];
      trials?: ModuleTrial[];
      history?: ModuleLicenseHistoryEntry[];
    } = {},
  ) {
    for (const m of seed.modules ?? []) this.modules.set(m.id, m);
    for (const o of seed.offers ?? []) this.offers.set(o.id, o);
    for (const b of seed.bundles ?? []) this.bundles.set(b.id, b);
    for (const l of seed.licenses ?? []) this.licenses.set(l.id, l);
    for (const t of seed.trials ?? []) this.trials.set(t.id, t);
    if (seed.history) this.history.push(...seed.history);
  }

  async saveMarketplaceModule(module: MarketplaceModuleDefinition): Promise<MarketplaceModuleDefinition> {
    this.modules.set(module.id, module);
    return module;
  }
  async findMarketplaceModule(id: string): Promise<MarketplaceModuleDefinition | null> {
    return this.modules.get(id) ?? null;
  }
  async listMarketplaceModules(): Promise<MarketplaceModuleDefinition[]> {
    return Array.from(this.modules.values());
  }

  async saveOffer(offer: MarketplaceOffer): Promise<MarketplaceOffer> {
    this.offers.set(offer.id, offer);
    return offer;
  }
  async findOffer(id: string): Promise<MarketplaceOffer | null> {
    return this.offers.get(id) ?? null;
  }
  async listOffers(): Promise<MarketplaceOffer[]> {
    return Array.from(this.offers.values());
  }

  async saveBundle(bundle: MarketplaceBundle): Promise<MarketplaceBundle> {
    this.bundles.set(bundle.id, bundle);
    return bundle;
  }
  async findBundle(id: string): Promise<MarketplaceBundle | null> {
    return this.bundles.get(id) ?? null;
  }
  async listBundles(): Promise<MarketplaceBundle[]> {
    return Array.from(this.bundles.values());
  }

  async saveLicense(license: ModuleLicense): Promise<ModuleLicense> {
    this.licenses.set(license.id, license);
    return license;
  }
  async findLicense(id: string): Promise<ModuleLicense | null> {
    return this.licenses.get(id) ?? null;
  }
  async listLicenses(tenantId?: string): Promise<ModuleLicense[]> {
    const all = Array.from(this.licenses.values());
    return tenantId ? all.filter((l) => l.tenantId === tenantId) : all;
  }

  async saveTrial(trial: ModuleTrial): Promise<ModuleTrial> {
    this.trials.set(trial.id, trial);
    return trial;
  }
  async findTrial(id: string): Promise<ModuleTrial | null> {
    return this.trials.get(id) ?? null;
  }
  async listTrials(tenantId?: string): Promise<ModuleTrial[]> {
    const all = Array.from(this.trials.values());
    return tenantId ? all.filter((t) => t.tenantId === tenantId) : all;
  }

  async saveHistoryEntry(entry: ModuleLicenseHistoryEntry): Promise<ModuleLicenseHistoryEntry> {
    this.history.push(entry);
    return entry;
  }
  async listHistory(tenantId?: string): Promise<ModuleLicenseHistoryEntry[]> {
    return tenantId ? this.history.filter((h) => h.tenantId === tenantId) : [...this.history];
  }
}

/**
 * Ofertas de DEMONSTRAÇÃO — 1 por `MarketplaceModuleDefinition` público do
 * catálogo. Nunca dado real, nunca persistido.
 */
export function createDemoOffers(catalog: MarketplaceModuleDefinition[] = buildMarketplaceCatalog()): MarketplaceOffer[] {
  const now = new Date().toISOString();
  return catalog
    .filter((m) => m.visibility === "public" && m.enabled)
    .map((m) => ({
      id: `demo-offer-${m.moduleId}`,
      name: `Oferta — ${m.name}`,
      description: m.description,
      type: "module" as const,
      moduleIds: [m.moduleId],
      deploymentPlans: m.allowedPlans,
      billingPlanIds: m.billingReferenceId ? [m.billingReferenceId] : undefined,
      recurring: true,
      status: "active" as const,
      enabled: true,
      visibility: m.visibility,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    }));
}

/**
 * Licenças de DEMONSTRAÇÃO — 1 licença `active` de `core.crm` por instalação
 * de `createDemoInstallations()`. Usado por testes, CLI e a tela admin.
 */
export function createDemoLicenses(installations: Installation[] = createDemoInstallations()): ModuleLicense[] {
  return installations.map((installation, index) => {
    const now = installation.createdAt;
    return {
      id: `demo-license-${index}-${installation.id}`,
      tenantId: installation.tenant.id,
      installationId: installation.id,
      moduleId: "core.crm",
      status: "active" as const,
      source: "included_in_plan" as const,
      startsAt: now,
      version: "1.0.0",
      createdAt: now,
      updatedAt: now,
    };
  });
}

export { createDemoBundles, createDemoInstallations };
