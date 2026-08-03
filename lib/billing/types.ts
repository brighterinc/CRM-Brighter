/**
 * Tipos centrais do Brighter Billing Engine — Foundation v1.
 *
 * Este módulo NUNCA cobra ninguém, NUNCA integra gateway (InfinitePay/
 * Stripe/Mercado Pago/banco), NUNCA gera boleto/Pix/nota fiscal e NUNCA
 * persiste de verdade. Trabalha só com domínio puro, dados em memória e
 * simulações determinísticas — mesma doutrina de `lib/monitoring/types.ts`.
 *
 * Reusa (nunca duplica): `DeploymentPlan` (`@/lib/deployment`) — o plano
 * TÉCNICO de implantação (lite/pro/dedicated) já resolvido pelo Module/
 * Deployment Engine. Um `BillingPlanDefinition` (plano COMERCIAL — preço,
 * ciclo, módulos incluídos) sempre referencia um `deploymentPlan` existente,
 * nunca redefine infraestrutura/compatibilidade de módulo.
 *
 * Diferença deliberada de vocabulário: `Installation.commercial`/`.technical`
 * (`lib/control-plane/types.ts`) são a visão da Brighter sobre o ESTÁGIO da
 * instalação (lead → produção). `SubscriptionStatus` aqui é um TERCEIRO eixo
 * — o estado FINANCEIRO da assinatura daquela instalação (paga, inadimplente,
 * suspensa por falta de pagamento). Uma instalação `commercial: "production"`
 * pode estar com `SubscriptionStatus: "past_due"` ao mesmo tempo — não é
 * duplicação, são preocupações diferentes que o Billing Engine é quem
 * introduz.
 */
import type { DeploymentPlan } from "@/lib/deployment";

/** Periodicidade de cobrança de uma assinatura ou de um item avulso. */
export type BillingCycle = "monthly" | "quarterly" | "semiannual" | "annual" | "one_time";

/**
 * Estado financeiro da assinatura — eixo próprio do Billing Engine, nunca
 * confundir com `InstallationStatus`/`CommercialStatus`/`TechnicalStatus` da
 * Control Plane nem com `TenantCommercialStatus`/`TenantTechnicalStatus` do
 * Tenant Engine. Ver `status.ts` pras transições válidas.
 */
export type SubscriptionStatus =
  | "draft"
  | "trial"
  | "active"
  | "past_due"
  | "grace_period"
  | "suspended"
  | "cancelled"
  | "expired";

export type InvoiceStatus = "draft" | "open" | "paid" | "overdue" | "void" | "cancelled" | "refunded";

export type PaymentStatus = "pending" | "authorized" | "paid" | "failed" | "refunded" | "cancelled";

export type BillingEventType =
  | "subscription_created"
  | "subscription_activated"
  | "subscription_changed"
  | "subscription_cancelled"
  | "subscription_suspended"
  | "subscription_reactivated"
  | "invoice_created"
  | "invoice_paid"
  | "invoice_overdue"
  | "invoice_voided"
  | "invoice_refunded"
  | "payment_failed"
  | "trial_started"
  | "trial_converted"
  | "grace_period_started"
  | "grace_period_ended"
  | "installation_suspension_recommended"
  | "installation_reactivation_recommended"
  | "usage_limit_warning"
  | "usage_limit_exceeded"
  | "module_entitlement_changed"
  | "discount_applied"
  | "credit_applied";

/** Valor monetário — sempre em centavos, sempre BRL nesta Foundation. Nunca ponto flutuante em domínio. */
export type Money = {
  amountCents: number;
  currency: "BRL";
};

/**
 * Limites contratados por plano/assinatura. Campo ausente = ilimitado/não
 * controlado nesta Foundation (nunca inferido como zero) — ver
 * `usage.ts::evaluateUsageAgainstLimits`.
 */
export type BillingLimits = {
  users?: number;
  contacts?: number;
  storageMb?: number;
  messagesPerMonth?: number;
  campaignsPerMonth?: number;
  aiActionsPerMonth?: number;
  activeModules?: number;
  whatsappConnections?: number;
};

/**
 * Snapshot de consumo observado num período — sempre um dado de ENTRADA
 * (real no futuro, sintético/simulado nesta Foundation), nunca inferido.
 */
export type BillingUsageSnapshot = {
  tenantId: string;
  installationId: string;
  /** ISO-8601 UTC. */
  periodStart: string;
  /** ISO-8601 UTC. */
  periodEnd: string;
  /** Chave = mesmo vocabulário de `BillingLimits` (ex.: "messagesPerMonth"). */
  metrics: Record<string, number>;
  /** ISO-8601 UTC. */
  observedAt: string;
};

/**
 * Definição comercial de um plano — o QUE é vendido. Sempre referencia um
 * `DeploymentPlan` já resolvido pelo Module/Deployment Engine; nunca
 * redefine compatibilidade de módulo ou infraestrutura.
 */
export type BillingPlanDefinition = {
  id: string;
  name: string;
  description: string;
  deploymentPlan: DeploymentPlan;
  allowedCycles: BillingCycle[];
  /**
   * Preço de DEMONSTRAÇÃO desta Foundation — nunca o preço comercial real da
   * Brighter (ver `catalog.ts` cabeçalho). `amountCents: 0` é válido e
   * documentado como "a configurar futuramente na Control Plane".
   */
  basePrice: Money;
  /** Ids de `lib/modules/catalog.ts::MODULE_CATALOG` incluídos sem custo extra. */
  includedModules: string[];
  /** Ids de módulo disponíveis como extra pago — nunca redefine `allowedPlans` do módulo. */
  optionalModules: string[];
  limits: BillingLimits;
  gracePeriodDays: number;
  /** Ids de plano pra qual upgrade É permitido a partir deste (imediato). */
  upgradeTo: string[];
  /** Ids de plano pra qual downgrade É permitido a partir deste (agendado). */
  downgradeTo: string[];
  enabled: boolean;
};

export type BillingSubscriptionItemType = "base_plan" | "module" | "usage" | "service" | "implementation";

export type BillingSubscriptionItem = {
  id: string;
  type: BillingSubscriptionItemType;
  /** Id do plano (`base_plan`) ou do módulo (`module`) referenciado — dot-path do catálogo correspondente. */
  referenceId: string;
  description: string;
  quantity: number;
  unitPrice: Money;
  recurring: boolean;
};

export type BillingDiscountType = "percentage" | "fixed";
export type BillingDiscountTarget = "subscription" | "module" | "invoice";

export type BillingDiscount = {
  id: string;
  type: BillingDiscountType;
  /** 0–100 quando `type: "percentage"`; centavos quando `type: "fixed"`. */
  value: number;
  appliesTo: BillingDiscountTarget;
  referenceId?: string;
  /** ISO-8601 UTC. */
  startsAt?: string;
  /** ISO-8601 UTC. */
  endsAt?: string;
};

export type BillingCredit = {
  id: string;
  tenantId: string;
  amount: Money;
  reason: string;
  /** ISO-8601 UTC. */
  expiresAt?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
};

/**
 * Referências SINTÉTICAS de um provedor externo — nunca dado sensível (sem
 * número de cartão/CVV/token/chave Pix). Nesta Foundation todo valor é
 * gerado localmente (`adapters.ts`), nunca vindo de rede.
 */
export type BillingProviderReference = {
  providerId: string;
  customerId?: string;
  subscriptionId?: string;
  invoiceId?: string;
  paymentMethodType?: string;
  lastFour?: string;
};

/** Mudança de plano/ciclo já agendada (downgrade padrão) — nunca aplicada antes de `effectiveAt`. */
export type BillingPendingPlanChange = {
  planId: string;
  cycle: BillingCycle;
  /** ISO-8601 UTC — sempre o início do próximo período. */
  effectiveAt: string;
};

export type BillingSubscription = {
  id: string;
  tenantId: string;
  installationId: string;
  planId: string;
  cycle: BillingCycle;
  status: SubscriptionStatus;
  /** ISO-8601 UTC. */
  startedAt: string;
  /** ISO-8601 UTC. */
  currentPeriodStart: string;
  /** ISO-8601 UTC. */
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  /** ISO-8601 UTC. */
  trialEndsAt?: string;
  /** ISO-8601 UTC. */
  gracePeriodEndsAt?: string;
  pendingPlanChange?: BillingPendingPlanChange;
  items: BillingSubscriptionItem[];
  discounts: BillingDiscount[];
  providerRef?: BillingProviderReference;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
};

export type BillingInvoiceItem = {
  id: string;
  description: string;
  referenceId?: string;
  quantity: number;
  unitPrice: Money;
  amount: Money;
};

export type BillingInvoice = {
  id: string;
  subscriptionId: string;
  tenantId: string;
  status: InvoiceStatus;
  subtotal: Money;
  discountTotal: Money;
  total: Money;
  /** ISO-8601 UTC. */
  dueAt: string;
  /** ISO-8601 UTC. */
  paidAt?: string;
  items: BillingInvoiceItem[];
  providerRef?: BillingProviderReference;
  /** ISO-8601 UTC. */
  createdAt: string;
};

export type BillingEvent = {
  id: string;
  tenantId: string;
  installationId: string;
  subscriptionId?: string;
  invoiceId?: string;
  type: BillingEventType;
  /** ISO-8601 UTC. */
  occurredAt: string;
  message: string;
  /** Já deve passar por `sanitizeBillingEvent` (`sanitization.ts`) antes de logar/persistir. */
  metadata?: Record<string, unknown>;
};

/** Erro estruturado — nunca mensagem genérica solta. `field` usa dot-path. */
export type BillingValidationError = { field: string; message: string };

export type { DeploymentPlan };
