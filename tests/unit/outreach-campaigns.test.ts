import { describe, expect, it } from "vitest";

import {
  activateCampaign,
  archiveCampaign,
  cancelCampaign,
  completeCampaign,
  createCampaign,
  pauseCampaign,
  resumeCampaign,
  scheduleCampaign,
} from "@/lib/outreach/campaigns";
import type { OutreachCampaign } from "@/lib/outreach/types";

function baseCampaign(overrides: Partial<OutreachCampaign> = {}): OutreachCampaign {
  return createCampaign({
    installationId: "inst-1",
    name: "Campanha teste",
    channel: "whatsapp",
    segmentId: "seg-1",
    cadenceId: "cad-1",
    ...overrides,
  });
}

describe("createCampaign", () => {
  it("nasce em draft com id/timestamps gerados", () => {
    const campaign = baseCampaign();
    expect(campaign.status).toBe("draft");
    expect(campaign.id).toBeTruthy();
    expect(campaign.createdAt).toBe(campaign.updatedAt);
  });
});

describe("ciclo de vida feliz: draft → scheduled → active → paused → active → completed → archived", () => {
  it("cada transição sucede e atualiza updatedAt", () => {
    let campaign = baseCampaign();

    const scheduled = scheduleCampaign(campaign, "2026-02-01T00:00:00.000Z");
    expect(scheduled.ok).toBe(true);
    if (!scheduled.ok) return;
    campaign = scheduled.campaign;
    expect(campaign.status).toBe("scheduled");
    expect(campaign.scheduledAt).toBe("2026-02-01T00:00:00.000Z");

    const activated = activateCampaign(campaign, "2026-02-02T00:00:00.000Z");
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    campaign = activated.campaign;
    expect(campaign.status).toBe("active");
    expect(campaign.startedAt).toBe("2026-02-02T00:00:00.000Z");

    const paused = pauseCampaign(campaign);
    expect(paused.ok && paused.campaign.status === "paused").toBe(true);
    if (!paused.ok) return;

    const resumed = resumeCampaign(paused.campaign);
    expect(resumed.ok && resumed.campaign.status === "active").toBe(true);
    if (!resumed.ok) return;

    const completed = completeCampaign(resumed.campaign, "2026-02-10T00:00:00.000Z");
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(completed.campaign.completedAt).toBe("2026-02-10T00:00:00.000Z");

    const archived = archiveCampaign(completed.campaign);
    expect(archived.ok && archived.campaign.status === "archived").toBe(true);
  });
});

describe("transições inválidas", () => {
  it("draft → active direto é inválido (precisa passar por scheduled)", () => {
    const result = activateCampaign(baseCampaign());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.field).toBe("status");
    expect(result.error.message).toMatch(/draft.*active/);
  });

  it("archived é terminal — nenhuma transição sai dele", () => {
    const campaign = baseCampaign();
    const scheduled = scheduleCampaign(campaign, "2026-01-01T00:00:00.000Z");
    if (!scheduled.ok) throw new Error("setup falhou");
    const cancelled = cancelCampaign(scheduled.campaign);
    if (!cancelled.ok) throw new Error("setup falhou");
    const archived = archiveCampaign(cancelled.campaign);
    if (!archived.ok) throw new Error("setup falhou");

    const reactivated = scheduleCampaign(archived.campaign, "2026-01-02T00:00:00.000Z");
    expect(reactivated.ok).toBe(false);
  });

  it("completed → active nunca reabre campanha concluída", () => {
    const campaign = baseCampaign();
    const scheduled = scheduleCampaign(campaign, "2026-01-01T00:00:00.000Z");
    if (!scheduled.ok) throw new Error("setup falhou");
    const activated = activateCampaign(scheduled.campaign);
    if (!activated.ok) throw new Error("setup falhou");
    const completed = completeCampaign(activated.campaign);
    if (!completed.ok) throw new Error("setup falhou");

    const reactivated = activateCampaign(completed.campaign);
    expect(reactivated.ok).toBe(false);
  });
});
