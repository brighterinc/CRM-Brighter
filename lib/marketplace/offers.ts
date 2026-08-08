/**
 * Ofertas comerciais — módulo individual, bundle, addon, serviço ou taxa de
 * implementação. Nunca preço real: `billingPlanIds`/`pricingReferenceId`
 * (em `metadata`) são PONTEIROS pro Billing Engine, que continua sendo a
 * fonte de preço (ver cabeçalho de `types.ts`).
 */
import { isOfferTransitionValid, MarketplaceInvalidTransitionError } from "./status";
import type { MarketplaceOffer, MarketplaceOfferStatus, MarketplaceValidationError } from "./types";

export type CreateOfferInput = {
  id: string;
  name: string;
  description?: string;
  type: MarketplaceOffer["type"];
  moduleIds: string[];
  deploymentPlans: MarketplaceOffer["deploymentPlans"];
  billingPlanIds?: string[];
  recurring: boolean;
  visibility?: MarketplaceOffer["visibility"];
  eligibleTenantIds?: string[];
  startsAt?: string;
  endsAt?: string;
  metadata?: Record<string, unknown>;
  now?: string;
};

export function createOffer(input: CreateOfferInput): { ok: true; offer: MarketplaceOffer } | { ok: false; errors: MarketplaceValidationError[] } {
  const errors: MarketplaceValidationError[] = [];
  if (!input.id.trim()) errors.push({ field: "id", message: "obrigatório" });
  if (!input.name.trim()) errors.push({ field: "name", message: "obrigatório" });
  if (input.moduleIds.length === 0) errors.push({ field: "moduleIds", message: "oferta precisa referenciar ao menos um módulo" });
  if (input.deploymentPlans.length === 0) errors.push({ field: "deploymentPlans", message: "oferta precisa estar disponível em ao menos um plano" });
  if (errors.length > 0) return { ok: false, errors };

  const now = input.now ?? new Date().toISOString();
  return {
    ok: true,
    offer: {
      id: input.id,
      name: input.name,
      description: input.description,
      type: input.type,
      moduleIds: input.moduleIds,
      deploymentPlans: input.deploymentPlans,
      billingPlanIds: input.billingPlanIds,
      recurring: input.recurring,
      status: "draft",
      enabled: false,
      visibility: input.visibility ?? "public",
      eligibleTenantIds: input.eligibleTenantIds,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    },
  };
}

function transition(offer: MarketplaceOffer, to: MarketplaceOfferStatus, enabled: boolean, now?: string): MarketplaceOffer {
  if (!isOfferTransitionValid(offer.status, to)) {
    throw new MarketplaceInvalidTransitionError("offer", offer.status, to);
  }
  return { ...offer, status: to, enabled, updatedAt: now ?? new Date().toISOString() };
}

export function activateOffer(offer: MarketplaceOffer, now?: string): MarketplaceOffer {
  return transition(offer, "active", true, now);
}

export function disableOffer(offer: MarketplaceOffer, now?: string): MarketplaceOffer {
  return transition(offer, "disabled", false, now);
}

export function archiveOffer(offer: MarketplaceOffer, now?: string): MarketplaceOffer {
  return transition(offer, "archived", false, now);
}

export function resolveOfferModules(offer: MarketplaceOffer): string[] {
  return Array.from(new Set(offer.moduleIds));
}

export type OfferCompatibilityResult = { compatible: boolean; blockers: string[]; warnings: string[] };

/** Compatibilidade estrutural da oferta (nunca redecide o que o Module Engine já resolve por módulo — ver `eligibility.ts` pra isso por instalação). */
export function validateOfferCompatibility(offer: MarketplaceOffer, deploymentPlan: MarketplaceOffer["deploymentPlans"][number]): OfferCompatibilityResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!offer.deploymentPlans.includes(deploymentPlan)) {
    blockers.push(`oferta "${offer.id}" não está disponível no plano "${deploymentPlan}"`);
  }
  if (offer.status !== "active" || !offer.enabled) {
    blockers.push(`oferta "${offer.id}" não está ativa (status "${offer.status}")`);
  }

  return { compatible: blockers.length === 0, blockers, warnings };
}

export type OfferAvailabilityResult = { available: boolean; blockers: string[]; warnings: string[] };

/** Disponibilidade temporal + elegibilidade de tenant (visibilidade privada) — nunca decide entitlement financeiro/técnico. */
export function evaluateOfferAvailability(offer: MarketplaceOffer, tenantId: string, now: string = new Date().toISOString()): OfferAvailabilityResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const nowMs = new Date(now).getTime();

  if (offer.status !== "active" || !offer.enabled) {
    blockers.push(`oferta "${offer.id}" não está ativa`);
  }
  if (offer.startsAt && nowMs < new Date(offer.startsAt).getTime()) {
    blockers.push(`oferta "${offer.id}" ainda não começou (início em ${offer.startsAt})`);
  }
  if (offer.endsAt && nowMs > new Date(offer.endsAt).getTime()) {
    blockers.push(`oferta "${offer.id}" já encerrou (fim em ${offer.endsAt})`);
  }
  if (offer.visibility === "private" && !(offer.eligibleTenantIds ?? []).includes(tenantId)) {
    blockers.push(`oferta "${offer.id}" é privada e o tenant "${tenantId}" não está na lista de elegíveis`);
  }
  if (offer.visibility === "internal" || offer.visibility === "hidden") {
    blockers.push(`oferta "${offer.id}" tem visibilidade "${offer.visibility}" — não disponível pra cliente final`);
  }

  return { available: blockers.length === 0, blockers, warnings };
}
