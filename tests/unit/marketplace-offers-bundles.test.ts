import { describe, expect, it } from "vitest";

import {
  activateOffer,
  archiveOffer,
  createOffer,
  disableOffer,
  evaluateOfferAvailability,
  resolveOfferModules,
  validateOfferCompatibility,
} from "@/lib/marketplace/offers";
import {
  createDemoBundles,
  deriveBundleConflicts,
  expandBundleModules,
  generateBundlePreview,
  resolveBundleDependencies,
  validateBundle,
} from "@/lib/marketplace/bundles";
import { MarketplaceInvalidTransitionError } from "@/lib/marketplace/status";
import type { MarketplaceBundle } from "@/lib/marketplace/types";

describe("createOffer / lifecycle", () => {
  it("cria oferta draft, desabilitada, e valida campos obrigatórios", () => {
    const result = createOffer({ id: "offer-1", name: "", type: "module", moduleIds: [], deploymentPlans: [], recurring: true });
    expect(result.ok).toBe(false);
  });

  it("createOffer -> activateOffer -> disableOffer -> archiveOffer segue transições válidas", () => {
    const created = createOffer({ id: "offer-1", name: "WhatsApp", type: "addon", moduleIds: ["channel.whatsapp"], deploymentPlans: ["dedicated"], recurring: true });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const active = activateOffer(created.offer);
    expect(active.status).toBe("active");
    expect(active.enabled).toBe(true);

    const disabled = disableOffer(active);
    expect(disabled.status).toBe("disabled");
    expect(disabled.enabled).toBe(false);

    const archived = archiveOffer(disabled);
    expect(archived.status).toBe("archived");
  });

  it("archiveOffer duas vezes lança MarketplaceInvalidTransitionError (archived é terminal)", () => {
    const created = createOffer({ id: "offer-1", name: "WhatsApp", type: "addon", moduleIds: ["channel.whatsapp"], deploymentPlans: ["dedicated"], recurring: true });
    if (!created.ok) throw new Error("setup falhou");
    const archived = archiveOffer(created.offer);
    expect(() => archiveOffer(archived)).toThrow(MarketplaceInvalidTransitionError);
  });

  it("resolveOfferModules deduplica moduleIds", () => {
    const created = createOffer({ id: "offer-1", name: "X", type: "module", moduleIds: ["core.crm", "core.crm"], deploymentPlans: ["lite"], recurring: false });
    if (!created.ok) throw new Error("setup falhou");
    expect(resolveOfferModules(created.offer)).toEqual(["core.crm"]);
  });
});

describe("validateOfferCompatibility / evaluateOfferAvailability", () => {
  it("oferta fora do plano informado é incompatível", () => {
    const created = createOffer({ id: "offer-1", name: "WhatsApp", type: "addon", moduleIds: ["channel.whatsapp"], deploymentPlans: ["dedicated"], recurring: true });
    if (!created.ok) throw new Error("setup falhou");
    const active = activateOffer(created.offer);
    const result = validateOfferCompatibility(active, "lite");
    expect(result.compatible).toBe(false);
  });

  it("oferta privada só disponível pro tenant elegível", () => {
    const created = createOffer({ id: "offer-1", name: "X", type: "module", moduleIds: ["core.crm"], deploymentPlans: ["lite"], recurring: false, visibility: "private", eligibleTenantIds: ["tenant-a"] });
    if (!created.ok) throw new Error("setup falhou");
    const active = activateOffer(created.offer);
    expect(evaluateOfferAvailability(active, "tenant-a").available).toBe(true);
    expect(evaluateOfferAvailability(active, "tenant-b").available).toBe(false);
  });

  it("oferta fora da janela temporal (startsAt/endsAt) não está disponível", () => {
    const created = createOffer({
      id: "offer-1",
      name: "X",
      type: "module",
      moduleIds: ["core.crm"],
      deploymentPlans: ["lite"],
      recurring: false,
      startsAt: "2030-01-01T00:00:00.000Z",
    });
    if (!created.ok) throw new Error("setup falhou");
    const active = activateOffer(created.offer);
    const result = evaluateOfferAvailability(active, "tenant-a", "2026-01-01T00:00:00.000Z");
    expect(result.available).toBe(false);
  });
});

describe("bundles", () => {
  it("validateBundle recusa módulo inexistente no Module Engine", () => {
    const bundle: MarketplaceBundle = {
      id: "b1",
      name: "Bundle X",
      version: "1.0.0",
      modules: [{ moduleId: "modulo.fantasma", role: "required" }],
      minimumPlan: "lite",
      status: "draft",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const errors = validateBundle(bundle);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("expandBundleModules separa required/optional", () => {
    const [bundle] = createDemoBundles();
    const { required, optional } = expandBundleModules(bundle!);
    expect(required.length).toBeGreaterThan(0);
    expect(required).not.toContain(undefined);
    expect(Array.isArray(optional)).toBe(true);
  });

  it("resolveBundleDependencies resolve dependsOn técnico (ex.: ai.memory -> ai.agents)", () => {
    const bundle = createDemoBundles().find((b) => b.id === "bundle-crm-whatsapp")!;
    const { resolved } = resolveBundleDependencies(bundle);
    expect(resolved).toContain("core.contacts");
  });

  it("deriveBundleConflicts detecta módulo que é ao mesmo tempo membro e incompatível", () => {
    const bundle: MarketplaceBundle = {
      id: "b-conflict",
      name: "Conflitante",
      version: "1.0.0",
      modules: [{ moduleId: "core.crm", role: "required" }],
      incompatibleModules: ["core.crm"],
      minimumPlan: "lite",
      status: "draft",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const conflicts = deriveBundleConflicts(bundle);
    expect(conflicts.length).toBe(1);
  });

  it("generateBundlePreview de um bundle de demonstração não tem blocker", () => {
    const bundle = createDemoBundles().find((b) => b.id === "bundle-crm-essencial")!;
    const preview = generateBundlePreview(bundle);
    expect(preview.blockers).toEqual([]);
  });

  it("generateBundlePreview avisa quando bundle inclui módulo planned", () => {
    const bundle: MarketplaceBundle = {
      id: "b-planned",
      name: "Com planned",
      version: "1.0.0",
      modules: [{ moduleId: "automation.campaigns", role: "optional" }],
      minimumPlan: "dedicated",
      status: "draft",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const preview = generateBundlePreview(bundle);
    expect(preview.warnings.some((w) => w.includes("planned"))).toBe(true);
  });

  it("createDemoBundles produz nomes neutros/ilustrativos, todos com módulos válidos", () => {
    const bundles = createDemoBundles();
    expect(bundles.length).toBeGreaterThan(0);
    for (const bundle of bundles) {
      expect(validateBundle(bundle)).toEqual([]);
    }
  });
});
