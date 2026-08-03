import { describe, expect, it } from "vitest";

import {
  BillingInvoiceNotFoundError,
  createDemoBillingSubscriptions,
  InMemoryBillingRepository,
} from "@/lib/billing/repository";
import { BillingSubscriptionValidationFailedError } from "@/lib/billing/subscriptions";
import { activateSubscription, createSubscription } from "@/lib/billing/subscriptions";

const NOW = "2026-01-01T00:00:00.000Z";

function subscription(id = "sub-1") {
  return activateSubscription(
    createSubscription({ id, tenantId: "t1", installationId: "i1", planId: "pro", cycle: "monthly", startedAt: NOW }, NOW),
    NOW,
  );
}

describe("InMemoryBillingRepository", () => {
  it("cada instância começa vazia", async () => {
    const repo = new InMemoryBillingRepository();
    expect(await repo.listSubscriptions()).toEqual([]);
    expect(await repo.listInvoices()).toEqual([]);
    expect(await repo.listEvents()).toEqual([]);
  });

  it("saveSubscription valida antes de salvar", async () => {
    const repo = new InMemoryBillingRepository();
    const invalid = { ...subscription(), planId: "inexistente" };
    await expect(repo.saveSubscription(invalid)).rejects.toThrow(BillingSubscriptionValidationFailedError);
  });

  it("salva e encontra por id, filtra por installationId", async () => {
    const repo = new InMemoryBillingRepository();
    await repo.saveSubscription(subscription("sub-1"));
    expect(await repo.findSubscription("sub-1")).not.toBeNull();
    expect(await repo.findSubscription("desconhecido")).toBeNull();
    expect(await repo.listSubscriptions("i1")).toHaveLength(1);
    expect(await repo.listSubscriptions("outra-instalacao")).toHaveLength(0);
  });

  it("findInvoice devolve null quando não existe (nunca lança)", async () => {
    const repo = new InMemoryBillingRepository();
    expect(await repo.findInvoice("inexistente")).toBeNull();
  });

  it("findLatestUsage devolve o snapshot mais recente por observedAt", async () => {
    const repo = new InMemoryBillingRepository();
    await repo.saveUsageSnapshot({ tenantId: "t1", installationId: "i1", periodStart: NOW, periodEnd: NOW, metrics: {}, observedAt: "2026-01-01T00:00:00.000Z" });
    await repo.saveUsageSnapshot({ tenantId: "t1", installationId: "i1", periodStart: NOW, periodEnd: NOW, metrics: {}, observedAt: "2026-01-05T00:00:00.000Z" });
    const latest = await repo.findLatestUsage("i1");
    expect(latest?.observedAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("BillingInvoiceNotFoundError existe e carrega o id (uso documentado por futuros consumidores)", () => {
    const error = new BillingInvoiceNotFoundError("inv-x");
    expect(error.id).toBe("inv-x");
  });
});

describe("createDemoBillingSubscriptions", () => {
  it("gera 1 assinatura 'active' por instalação de demonstração", () => {
    const subscriptions = createDemoBillingSubscriptions();
    expect(subscriptions.length).toBeGreaterThan(0);
    expect(subscriptions.every((s) => s.status === "active")).toBe(true);
  });
});
