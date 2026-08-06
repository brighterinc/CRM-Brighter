/**
 * Ciclo de vida de campanha — Outreach & AI Cadence Engine, Foundation v1.
 *
 * Toda função de transição é pura: recebe a campanha + contexto, devolve
 * `{ ok: true, campaign }` ou `{ ok: false, error }` — nunca lança, nunca
 * dispara envio real. Transição inválida usa `isCampaignTransitionValid`
 * (`status.ts`) como fonte única de verdade.
 */
import { isCampaignTransitionValid } from "./status";
import type { CampaignStatus, OutreachCampaign, OutreachValidationError } from "./types";

export type CampaignTransitionResult = { ok: true; campaign: OutreachCampaign } | { ok: false; error: OutreachValidationError };

function transition(campaign: OutreachCampaign, to: CampaignStatus, patch: Partial<OutreachCampaign> = {}): CampaignTransitionResult {
  if (!isCampaignTransitionValid(campaign.status, to)) {
    return {
      ok: false,
      error: { field: "status", message: `transição inválida: "${campaign.status}" → "${to}"` },
    };
  }
  return {
    ok: true,
    campaign: { ...campaign, ...patch, status: to, updatedAt: new Date().toISOString() },
  };
}

export type CreateCampaignInput = Omit<OutreachCampaign, "id" | "status" | "createdAt" | "updatedAt">;

export function createCampaign(input: CreateCampaignInput): OutreachCampaign {
  const now = new Date().toISOString();
  return { ...input, id: crypto.randomUUID(), status: "draft", createdAt: now, updatedAt: now };
}

export function scheduleCampaign(campaign: OutreachCampaign, scheduledAt: string): CampaignTransitionResult {
  return transition(campaign, "scheduled", { scheduledAt });
}

export function activateCampaign(campaign: OutreachCampaign, now: string = new Date().toISOString()): CampaignTransitionResult {
  return transition(campaign, "active", { startedAt: campaign.startedAt ?? now });
}

export function pauseCampaign(campaign: OutreachCampaign): CampaignTransitionResult {
  return transition(campaign, "paused");
}

export function resumeCampaign(campaign: OutreachCampaign): CampaignTransitionResult {
  return transition(campaign, "active");
}

export function cancelCampaign(campaign: OutreachCampaign): CampaignTransitionResult {
  return transition(campaign, "cancelled");
}

export function completeCampaign(campaign: OutreachCampaign, now: string = new Date().toISOString()): CampaignTransitionResult {
  return transition(campaign, "completed", { completedAt: now });
}

export function archiveCampaign(campaign: OutreachCampaign): CampaignTransitionResult {
  return transition(campaign, "archived");
}

export function blockCampaign(campaign: OutreachCampaign): CampaignTransitionResult {
  return transition(campaign, "blocked");
}
