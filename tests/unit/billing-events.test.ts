import { describe, expect, it } from "vitest";

import { createBillingEvent, deriveBillingEvents, summarizeBillingEvents } from "@/lib/billing/events";
import { activateSubscription, createSubscription } from "@/lib/billing/subscriptions";

const NOW = "2026-01-01T00:00:00.000Z";

describe("createBillingEvent", () => {
  it("constrói o evento com os campos dados", () => {
    const event = createBillingEvent({ id: "e1", tenantId: "t1", installationId: "i1", type: "invoice_paid", occurredAt: NOW, message: "paga" });
    expect(event.type).toBe("invoice_paid");
    expect(event.message).toBe("paga");
  });
});

describe("deriveBillingEvents", () => {
  it("deriva evento de transição de assinatura só quando o status muda", () => {
    const subscription = activateSubscription(
      createSubscription({ id: "sub-1", tenantId: "t1", installationId: "i1", planId: "pro", cycle: "monthly", startedAt: NOW }, NOW),
      NOW,
    );
    let counter = 0;
    const events = deriveBillingEvents({
      tenantId: "t1",
      installationId: "i1",
      now: NOW,
      nextId: () => `evt-${(counter += 1)}`,
      subscription,
      previousSubscriptionStatus: "draft",
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("subscription_activated");
  });

  it("não deriva evento de assinatura quando o status não mudou", () => {
    const subscription = activateSubscription(
      createSubscription({ id: "sub-1", tenantId: "t1", installationId: "i1", planId: "pro", cycle: "monthly", startedAt: NOW }, NOW),
      NOW,
    );
    const events = deriveBillingEvents({
      tenantId: "t1",
      installationId: "i1",
      now: NOW,
      nextId: () => "evt-x",
      subscription,
      previousSubscriptionStatus: "active",
    });
    expect(events).toHaveLength(0);
  });

  it("deriva eventos de uso (warning/exceeded) a partir de UsageMetricEvaluation", () => {
    const events = deriveBillingEvents({
      tenantId: "t1",
      installationId: "i1",
      now: NOW,
      nextId: () => "evt-usage",
      usageEvaluations: [{ metric: "contacts", used: 100, limit: 100, percentage: 100, status: "exceeded" }],
    });
    expect(events.some((e) => e.type === "usage_limit_exceeded")).toBe(true);
  });
});

describe("summarizeBillingEvents", () => {
  it("agrupa por tipo e acha o mais recente", () => {
    const events = [
      createBillingEvent({ id: "e1", tenantId: "t1", installationId: "i1", type: "invoice_paid", occurredAt: "2026-01-01T00:00:00.000Z", message: "a" }),
      createBillingEvent({ id: "e2", tenantId: "t1", installationId: "i1", type: "invoice_paid", occurredAt: "2026-01-02T00:00:00.000Z", message: "b" }),
    ];
    const summary = summarizeBillingEvents(events);
    expect(summary.total).toBe(2);
    expect(summary.byType.invoice_paid).toBe(2);
    expect(summary.latest?.id).toBe("e2");
  });

  it("lista vazia devolve latest null", () => {
    expect(summarizeBillingEvents([]).latest).toBeNull();
  });
});
