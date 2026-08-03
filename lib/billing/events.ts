/**
 * Eventos de domínio do Billing Engine — Foundation v1. Nunca dispara
 * webhook real (`docs/billing/billing-engine.md` §eventos) — só produz a
 * linha de auditoria/timeline em memória. `metadata` deve passar por
 * `sanitizeBillingEvent` (`sanitization.ts`) antes de logar/persistir.
 */
import type { BillingEvent, BillingEventType, BillingInvoice, BillingSubscription } from "./types";
import type { UsageMetricEvaluation } from "./usage";

export type CreateBillingEventInput = {
  id: string;
  tenantId: string;
  installationId: string;
  subscriptionId?: string;
  invoiceId?: string;
  type: BillingEventType;
  occurredAt: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export function createBillingEvent(input: CreateBillingEventInput): BillingEvent {
  return { ...input };
}

export type DeriveBillingEventsContext = {
  tenantId: string;
  installationId: string;
  now: string;
  /** Sequência determinística de ids — evita `crypto.randomUUID()` dentro de uma função pura. */
  nextId: () => string;
  subscription?: BillingSubscription;
  previousSubscriptionStatus?: BillingSubscription["status"];
  invoice?: BillingInvoice;
  previousInvoiceStatus?: BillingInvoice["status"];
  usageEvaluations?: UsageMetricEvaluation[];
};

/**
 * Deriva eventos a partir de uma transição observada — nunca cria evento
 * "do nada"; cada evento aqui corresponde a uma mudança de estado real entre
 * `previous*` e o estado atual passado em `context`.
 */
export function deriveBillingEvents(context: DeriveBillingEventsContext): BillingEvent[] {
  const events: BillingEvent[] = [];
  const base = { tenantId: context.tenantId, installationId: context.installationId, occurredAt: context.now };

  if (context.subscription && context.previousSubscriptionStatus !== context.subscription.status) {
    const sub = context.subscription;
    const typeByStatus: Partial<Record<BillingSubscription["status"], BillingEventType>> = {
      trial: "trial_started",
      active: context.previousSubscriptionStatus === "trial" ? "trial_converted" : "subscription_activated",
      cancelled: "subscription_cancelled",
      suspended: "subscription_suspended",
      grace_period: "grace_period_started",
    };
    const type = typeByStatus[sub.status] ?? "subscription_changed";
    events.push(
      createBillingEvent({
        ...base,
        id: context.nextId(),
        subscriptionId: sub.id,
        type,
        message: `assinatura "${sub.id}" mudou de "${context.previousSubscriptionStatus ?? "—"}" para "${sub.status}"`,
      }),
    );
  }

  if (context.invoice && context.previousInvoiceStatus !== context.invoice.status) {
    const invoice = context.invoice;
    const typeByStatus: Partial<Record<BillingInvoice["status"], BillingEventType>> = {
      open: "invoice_created",
      paid: "invoice_paid",
      overdue: "invoice_overdue",
      void: "invoice_voided",
      refunded: "invoice_refunded",
    };
    const type = typeByStatus[invoice.status];
    if (type) {
      events.push(
        createBillingEvent({
          ...base,
          id: context.nextId(),
          invoiceId: invoice.id,
          subscriptionId: invoice.subscriptionId,
          type,
          message: `invoice "${invoice.id}" mudou de "${context.previousInvoiceStatus ?? "—"}" para "${invoice.status}"`,
        }),
      );
    }
  }

  for (const evaluation of context.usageEvaluations ?? []) {
    if (evaluation.status === "exceeded") {
      events.push(
        createBillingEvent({
          ...base,
          id: context.nextId(),
          subscriptionId: context.subscription?.id,
          type: "usage_limit_exceeded",
          message: `métrica "${String(evaluation.metric)}" excedeu o limite (${evaluation.used}/${evaluation.limit})`,
        }),
      );
    } else if (evaluation.status === "warning") {
      events.push(
        createBillingEvent({
          ...base,
          id: context.nextId(),
          subscriptionId: context.subscription?.id,
          type: "usage_limit_warning",
          message: `métrica "${String(evaluation.metric)}" em ${evaluation.percentage}% do limite`,
        }),
      );
    }
  }

  return events;
}

export type BillingEventsSummary = {
  total: number;
  byType: Partial<Record<BillingEventType, number>>;
  latest: BillingEvent | null;
};

export function summarizeBillingEvents(events: BillingEvent[]): BillingEventsSummary {
  const byType: Partial<Record<BillingEventType, number>> = {};
  for (const event of events) {
    byType[event.type] = (byType[event.type] ?? 0) + 1;
  }
  const latest = events.reduce<BillingEvent | null>((acc, e) => (!acc || e.occurredAt > acc.occurredAt ? e : acc), null);
  return { total: events.length, byType, latest };
}
