/**
 * Repositório abstrato do Billing Engine — Foundation v1.
 *
 * `BillingRepository` é a interface; `InMemoryBillingRepository` é a única
 * implementação desta etapa — DEMONSTRAÇÃO/TESTE, não produção: sem tabela,
 * sem migration, sem Supabase real (mesma doutrina de
 * `InMemoryMonitoringRepository`/`InMemoryInstallationRepository`). Cada
 * instância começa vazia — nunca singleton global mutável da aplicação.
 * Persistência real fica pra uma futura Control Plane com persistência (ver
 * ROADMAP.md).
 */
import { createDemoInstallations } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";

import { BillingSubscriptionValidationFailedError, createSubscription } from "./subscriptions";
import { validateBillingSubscriptionInput } from "./validation";
import type { BillingEvent, BillingInvoice, BillingSubscription, BillingUsageSnapshot } from "./types";

export class BillingSubscriptionNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`billing_subscription_not_found: ${id}`);
    this.name = "BillingSubscriptionNotFoundError";
  }
}

export class BillingInvoiceNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`billing_invoice_not_found: ${id}`);
    this.name = "BillingInvoiceNotFoundError";
  }
}

export interface BillingRepository {
  saveSubscription(subscription: BillingSubscription): Promise<BillingSubscription>;
  findSubscription(id: string): Promise<BillingSubscription | null>;
  listSubscriptions(installationId?: string): Promise<BillingSubscription[]>;
  saveInvoice(invoice: BillingInvoice): Promise<BillingInvoice>;
  findInvoice(id: string): Promise<BillingInvoice | null>;
  listInvoices(subscriptionId?: string): Promise<BillingInvoice[]>;
  saveUsageSnapshot(snapshot: BillingUsageSnapshot): Promise<BillingUsageSnapshot>;
  findLatestUsage(installationId: string): Promise<BillingUsageSnapshot | null>;
  saveEvent(event: BillingEvent): Promise<BillingEvent>;
  listEvents(installationId?: string): Promise<BillingEvent[]>;
}

export class InMemoryBillingRepository implements BillingRepository {
  private readonly subscriptions = new Map<string, BillingSubscription>();
  private readonly invoices = new Map<string, BillingInvoice>();
  private readonly usageSnapshots: BillingUsageSnapshot[] = [];
  private readonly events: BillingEvent[] = [];

  constructor(
    seed: {
      subscriptions?: BillingSubscription[];
      invoices?: BillingInvoice[];
      usageSnapshots?: BillingUsageSnapshot[];
      events?: BillingEvent[];
    } = {},
  ) {
    for (const subscription of seed.subscriptions ?? []) this.subscriptions.set(subscription.id, subscription);
    for (const invoice of seed.invoices ?? []) this.invoices.set(invoice.id, invoice);
    this.usageSnapshots.push(...(seed.usageSnapshots ?? []));
    this.events.push(...(seed.events ?? []));
  }

  async saveSubscription(subscription: BillingSubscription): Promise<BillingSubscription> {
    const errors = validateBillingSubscriptionInput(subscription);
    if (errors.length > 0) throw new BillingSubscriptionValidationFailedError(errors);
    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  async findSubscription(id: string): Promise<BillingSubscription | null> {
    return this.subscriptions.get(id) ?? null;
  }

  async listSubscriptions(installationId?: string): Promise<BillingSubscription[]> {
    const all = Array.from(this.subscriptions.values());
    return installationId ? all.filter((s) => s.installationId === installationId) : all;
  }

  async saveInvoice(invoice: BillingInvoice): Promise<BillingInvoice> {
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  async findInvoice(id: string): Promise<BillingInvoice | null> {
    return this.invoices.get(id) ?? null;
  }

  async listInvoices(subscriptionId?: string): Promise<BillingInvoice[]> {
    const all = Array.from(this.invoices.values());
    return subscriptionId ? all.filter((i) => i.subscriptionId === subscriptionId) : all;
  }

  async saveUsageSnapshot(snapshot: BillingUsageSnapshot): Promise<BillingUsageSnapshot> {
    this.usageSnapshots.push(snapshot);
    return snapshot;
  }

  async findLatestUsage(installationId: string): Promise<BillingUsageSnapshot | null> {
    const matching = this.usageSnapshots.filter((s) => s.installationId === installationId);
    if (matching.length === 0) return null;
    return matching.reduce((latest, current) => (current.observedAt > latest.observedAt ? current : latest));
  }

  async saveEvent(event: BillingEvent): Promise<BillingEvent> {
    this.events.push(event);
    return event;
  }

  async listEvents(installationId?: string): Promise<BillingEvent[]> {
    return installationId ? this.events.filter((e) => e.installationId === installationId) : [...this.events];
  }
}

/**
 * Catálogo local/in-memory de DEMONSTRAÇÃO — 1 assinatura `active` por
 * instalação de `createDemoInstallations()` (`lib/control-plane/`), no plano
 * comercial de mesmo id que `installation.deploymentPlan`. Usado por testes,
 * CLI e a tela admin. Nunca dado real, nunca persistido.
 */
export function createDemoBillingSubscriptions(installations: Installation[] = createDemoInstallations()): BillingSubscription[] {
  return installations.map((installation, index) => {
    const now = installation.createdAt;
    const draft = createSubscription(
      {
        id: `demo-sub-${index}-${installation.id}`,
        tenantId: installation.tenant.id,
        installationId: installation.id,
        planId: installation.deploymentPlan,
        cycle: "monthly",
        startedAt: now,
      },
      now,
    );
    return { ...draft, status: "active" as const };
  });
}
