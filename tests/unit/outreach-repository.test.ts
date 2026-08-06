import { describe, expect, it } from "vitest";

import { createDemoCadence, createDemoCampaigns, createDemoSegment, InMemoryOutreachRepository } from "@/lib/outreach/repository";
import { validateCadence } from "@/lib/outreach/validation";
import type { OutreachCampaign } from "@/lib/outreach/types";

function campaign(id: string): OutreachCampaign {
  const now = new Date().toISOString();
  return {
    id,
    installationId: "inst-1",
    name: `Campanha ${id}`,
    status: "draft",
    channel: "whatsapp",
    segmentId: "seg-1",
    cadenceId: "cad-1",
    createdAt: now,
    updatedAt: now,
  };
}

describe("InMemoryOutreachRepository", () => {
  it("começa vazia", async () => {
    const repo = new InMemoryOutreachRepository();
    expect(await repo.listCampaigns()).toEqual([]);
    expect(await repo.listCadences()).toEqual([]);
    expect(await repo.listSegments()).toEqual([]);
    expect(await repo.listEnrollments()).toEqual([]);
  });

  it("save/find round trip de campanha", async () => {
    const repo = new InMemoryOutreachRepository();
    await repo.saveCampaign(campaign("c1"));
    expect((await repo.findCampaign("c1"))?.id).toBe("c1");
    expect(await repo.findCampaign("inexistente")).toBeNull();
  });

  it("listCampaigns filtra por installationId quando fornecido", async () => {
    const repo = new InMemoryOutreachRepository();
    await repo.saveCampaign({ ...campaign("c1"), installationId: "inst-a" });
    await repo.saveCampaign({ ...campaign("c2"), installationId: "inst-b" });
    expect((await repo.listCampaigns("inst-a")).map((c) => c.id)).toEqual(["c1"]);
  });

  it("seed via constructor populates as coleções", async () => {
    const repo = new InMemoryOutreachRepository({ campaigns: [campaign("seed-1")] });
    expect(await repo.findCampaign("seed-1")).not.toBeNull();
  });

  it("findEnrollmentByIdempotencyKey encontra pela chave, não pelo id", async () => {
    const repo = new InMemoryOutreachRepository();
    await repo.saveEnrollment({
      id: "enr-1",
      campaignId: "camp-1",
      cadenceId: "cad-1",
      contactId: "c1",
      status: "pending",
      idempotencyKey: "camp-1:c1",
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect((await repo.findEnrollmentByIdempotencyKey("camp-1:c1"))?.id).toBe("enr-1");
    expect(await repo.findEnrollmentByIdempotencyKey("inexistente")).toBeNull();
  });
});

describe("createDemoSegment / createDemoCadence / createDemoCampaigns", () => {
  it("segmento de demonstração é canal whatsapp com filtro", () => {
    const segment = createDemoSegment();
    expect(segment.channel).toBe("whatsapp");
    expect(segment.filters.length).toBeGreaterThan(0);
  });

  it("cadência de demonstração tem stopOnReply/stopOnOptOut sempre true e passa na validação estrutural (só falha por módulo planned)", () => {
    const cadence = createDemoCadence();
    expect(cadence.stopOnReply).toBe(true);
    expect(cadence.stopOnOptOut).toBe(true);
    const errors = validateCadence({ cadence, enabledModuleIds: ["automation.campaigns"], deploymentPlan: "dedicated" });
    expect(errors.every((e) => e.message.includes("automation.campaigns"))).toBe(true);
  });

  it("createDemoCampaigns gera 1 campanha por instalação, todas canal whatsapp", () => {
    const campaigns = createDemoCampaigns([{ id: "inst-1", createdAt: "2026-01-01T00:00:00.000Z" } as never]);
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]?.channel).toBe("whatsapp");
    expect(campaigns[0]?.installationId).toBe("inst-1");
  });
});
