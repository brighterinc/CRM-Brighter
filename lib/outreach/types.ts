/**
 * Tipos centrais da Brighter Outreach & AI Cadence Engine — Foundation v1.
 *
 * Este módulo NUNCA envia mensagem real (sem WAHA, sem Meta Cloud, sem
 * e-mail/SMS reais), NUNCA chama IA externa, NUNCA agenda nada de verdade
 * (sem `setTimeout`/cron/worker/fila real), NUNCA persiste (repositório
 * in-memory) e NUNCA acessa a Lumina. É a camada de domínio que modela "o
 * que uma instalação White Label PODE fazer em outreach/cadência" —
 * campanhas, segmentos, audiência, cadências multi-etapa, janelas de envio,
 * throttling, templates, respostas, IA opcional e handoff humano — como
 * simulação determinística, no mesmo nível de abstração que Automation/
 * Billing/Monitoring (nunca no nível de execução real de canal).
 *
 * Referencia (nunca duplica) o módulo `automation.campaigns`
 * (`lib/modules/catalog.ts::MODULE_CATALOG`, `status: "planned"` — nunca
 * autorizado em produção nesta Foundation, mesma regra de
 * `resolveBillingEntitlements`/`validateWorkflowDefinition`) e o spec
 * funcional futuro `docs/modules/campaigns-and-cadences.md`. Distinto do
 * motor real de follow-up do CRM (`lib/followup/` — `followup_enrollments`
 * reais, disparados por `event_log`, DB-backed): aquele executa follow-up
 * 1:1 de verdade hoje. Este é a modelagem de PLATAFORMA da capacidade de
 * outreach em MASSA/cadência multi-etapa de uma `Installation` da Control
 * Plane — nunca reimplementa, nunca importa, nunca substitui o motor de
 * follow-up legado, nem o Automation Engine genérico (`lib/automation-engine/`).
 *
 * Prefixo `Outreach`/`Cadence` em todo tipo/função exportada — nunca os
 * mesmos nomes do motor de follow-up (`EnrollmentStatus`/`EnrollmentOutcome`/
 * `FlowNode`/`NodeResult` já existem lá com OUTRO significado) nem do
 * Automation Engine (`Workflow*`).
 *
 * Opt-out/consentimento aqui são modelados em memória, mas ESPELHANDO a
 * forma real (`contacts.is_blocked`+`blocked_reason` — irrevogável, setado
 * por regex STOP; `contacts.consent` jsonb `{marketing,transactional,
 * profiling}`) — nunca contradizendo o que já existe em produção.
 */
import type { DeploymentPlan } from "@/lib/deployment";

// ---------------------------------------------------------------------------
// Canal e catálogo (declarativo — ver catalog.ts)
// ---------------------------------------------------------------------------

export type OutreachChannel = "whatsapp" | "email" | "sms" | "internal";

export type OutreachAiCapabilityId =
  | "classify_response"
  | "detect_interest"
  | "detect_objection"
  | "detect_opt_out"
  | "suggest_reply"
  | "recommend_handoff"
  | "generate_summary"
  | "recommend_next_action";

export type OutreachCatalogAvailability = "foundation_simulated_only" | "requires_automation_adapters" | "requires_channel_adapter";

export type OutreachCampaignTypeDefinition = {
  id: string;
  name: string;
  description: string;
  channel: OutreachChannel;
  /** Ids de `lib/modules/catalog.ts::MODULE_CATALOG` exigidos. */
  requiredModules: string[];
  allowedPlans: DeploymentPlan[];
  status: "stable" | "beta" | "planned";
  simulatedOnly: boolean;
  requiresAutomationEngine: boolean;
  requiresAiCapability: boolean;
  supportsPauseOnReply: boolean;
  supportsOptOut: boolean;
  supportsRetry: boolean;
};

export type OutreachCadenceStepTypeDefinition = {
  id: string;
  name: string;
  description: string;
  supportsDelay: boolean;
  supportsTemplate: boolean;
  requiresAiCapability: OutreachAiCapabilityId | null;
};

export type OutreachResponseClassificationDefinition = {
  id: string;
  name: string;
  description: string;
  stopsCadence: boolean;
  recommendsHandoff: boolean;
};

export type OutreachBlockReasonDefinition = {
  id: string;
  name: string;
  description: string;
  category: "consent" | "channel" | "billing" | "monitoring" | "throttle" | "schedule" | "data_quality";
};

export type OutreachThrottlingPolicyDefinition = {
  id: string;
  name: string;
  description: string;
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  minDelaySeconds: number;
};

export type OutreachOptOutReasonDefinition = {
  id: string;
  name: string;
  description: string;
  irrevocable: boolean;
};

export type OutreachAiCapabilityDefinition = {
  id: OutreachAiCapabilityId;
  name: string;
  description: string;
  requiresModule: string;
  simulatedOnly: true;
  lowConfidenceRecommendsHuman: true;
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "cancelled" | "archived" | "blocked";

export type CadenceStatus = "draft" | "active" | "paused" | "completed" | "cancelled";

export type EnrollmentStatus =
  | "pending"
  | "scheduled"
  | "active"
  | "waiting"
  | "responded"
  | "qualified"
  | "transferred"
  | "completed"
  | "cancelled"
  | "opted_out"
  | "blocked"
  | "failed";

export type DeliveryStatus =
  | "pending"
  | "scheduled"
  | "simulated"
  | "sent"
  | "delivered"
  | "read"
  | "replied"
  | "failed"
  | "skipped"
  | "blocked"
  | "cancelled";

export type ResponseClassification =
  | "interested"
  | "not_interested"
  | "question"
  | "objection"
  | "meeting_request"
  | "support_request"
  | "opt_out"
  | "wrong_contact"
  | "spam"
  | "unknown";

export type CadenceStepType =
  | "message"
  | "email"
  | "delay"
  | "condition"
  | "wait_for_reply"
  | "assign_owner"
  | "create_task"
  | "update_pipeline"
  | "transfer_to_human"
  | "end";

// ---------------------------------------------------------------------------
// Condições (mesmo shape conceitual de `WorkflowCondition` do Automation
// Engine, redeclarado aqui pra não criar dependência cruzada entre fundações)
// ---------------------------------------------------------------------------

export type OutreachConditionOperator = "eq" | "neq" | "contains" | "exists" | "not_exists";

export type OutreachCondition = {
  field: string;
  op: OutreachConditionOperator;
  value?: string;
};

// ---------------------------------------------------------------------------
// Segmento e audiência
// ---------------------------------------------------------------------------

export type OutreachSegmentFilterOperator = "eq" | "neq" | "contains" | "not_contains" | "in" | "not_in" | "exists" | "not_exists";

export type OutreachSegmentFilter = {
  field: string;
  op: OutreachSegmentFilterOperator;
  value?: string | string[];
};

export type OutreachSegment = {
  id: string;
  name: string;
  description?: string;
  channel: OutreachChannel;
  filters: OutreachSegmentFilter[];
  excludeContactIds: string[];
  maxAudienceSize?: number;
  createdAt: string;
  updatedAt: string;
};

/** Contato sintético usado só em simulação/teste — nunca lido de banco real. Espelha `Contact` (`lib/types/contacts.ts`) só nos campos relevantes a outreach. */
export type OutreachSyntheticContact = {
  id: string;
  name: string | null;
  phoneNumber: string | null;
  email: string | null;
  tags: string[];
  customFields: Record<string, unknown>;
  isBlocked: boolean;
  blockedReason: string | null;
  consent: {
    marketing?: { granted: boolean; grantedAt?: string };
    transactional?: { granted: boolean; grantedAt?: string };
  };
  ownerUserId: string | null;
};

export type OutreachIneligibilityReason =
  | "opted_out"
  | "no_marketing_consent"
  | "no_channel_address"
  | "already_enrolled"
  | "already_responded"
  | "duplicate_in_audience"
  | "excluded_by_segment";

export type OutreachAudienceExclusion = {
  contactId: string;
  reason: OutreachIneligibilityReason;
};

export type OutreachAudiencePreview = {
  segmentId: string;
  totalMatched: number;
  eligible: string[];
  excluded: OutreachAudienceExclusion[];
  eligibleCount: number;
  excludedCount: number;
  cappedByMaxAudienceSize: boolean;
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Templates e personalização
// ---------------------------------------------------------------------------

export type OutreachTemplateVariable =
  | "first_name"
  | "full_name"
  | "company_name"
  | "owner_name"
  | "campaign_name"
  | `custom.${string}`;

export type OutreachTemplate = {
  id: string;
  name: string;
  channel: OutreachChannel;
  body: string;
  fallbackBody?: string;
  createdAt: string;
  updatedAt: string;
};

export type OutreachPersonalizationContext = {
  contact: OutreachSyntheticContact;
  ownerName?: string;
  campaignName?: string;
  customFields?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Janela de envio e agendamento
// ---------------------------------------------------------------------------

/** 0=domingo .. 6=sábado, mesma convenção de `Date#getUTCDay()`. */
export type OutreachWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type OutreachSendingWindow = {
  timezone: string;
  daysOfWeek: OutreachWeekday[];
  /** Hora local 0-23. */
  startHour: number;
  /** Hora local 0-23, exclusiva. */
  endHour: number;
};

export type OutreachTimezonePolicy = {
  timezone: string;
  /** Feriados não são implementados nesta Foundation — ver `docs/outreach/throttling-and-windows.md`. */
  observeHolidays: false;
};

export type OutreachSchedule = {
  window: OutreachSendingWindow;
  timezonePolicy: OutreachTimezonePolicy;
};

// ---------------------------------------------------------------------------
// Throttling
// ---------------------------------------------------------------------------

export type OutreachThrottlingPolicy = {
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  minDelaySeconds: number;
  maxConcurrent: number;
  randomJitterSeconds?: number;
  channelLimit?: number;
  installationLimit?: number;
  ownerLimit?: number;
};

export type OutreachThrottleCounters = {
  sentInCurrentMinute: number;
  sentInCurrentHour: number;
  sentInCurrentDay: number;
  concurrentInFlight: number;
};

export type OutreachThrottleEvaluation = {
  allowed: boolean;
  delaySeconds: number;
  blockers: string[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Cadência
// ---------------------------------------------------------------------------

export type OutreachCadenceStep = {
  id: string;
  name: string;
  type: CadenceStepType;
  order: number;
  delaySeconds?: number;
  templateId?: string;
  conditions?: OutreachCondition[];
  onSuccess?: string[];
  onFailure?: string[];
  configuration: Record<string, unknown>;
};

export type OutreachCadence = {
  id: string;
  name: string;
  description?: string;
  status: CadenceStatus;
  channel: OutreachChannel;
  steps: OutreachCadenceStep[];
  stopOnReply: boolean;
  stopOnOptOut: boolean;
  timezone: string;
  sendingWindow?: OutreachSendingWindow;
  throttlingPolicy?: OutreachThrottlingPolicy;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Campanha
// ---------------------------------------------------------------------------

export type OutreachCampaign = {
  id: string;
  installationId: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  channel: OutreachChannel;
  segmentId: string;
  cadenceId: string;
  ownerId?: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

export type OutreachEnrollment = {
  id: string;
  campaignId: string;
  cadenceId: string;
  contactId: string;
  leadId?: string;
  ownerId?: string;
  status: EnrollmentStatus;
  currentStepId?: string;
  nextStepAt?: string;
  lastInteractionAt?: string;
  responseClassification?: ResponseClassification;
  /** Chave de idempotência — mesma ideia do `Idempotency-Key` real da API (CLAUDE.md), modelada em memória. Formato: `orgId:campaignId:contactId`. */
  idempotencyKey: string;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type OutreachDelivery = {
  id: string;
  enrollmentId: string;
  stepId: string;
  status: DeliveryStatus;
  scheduledAt?: string;
  sentAt?: string;
  attempt: number;
  lastError?: string;
};

// ---------------------------------------------------------------------------
// Respostas e IA opcional
// ---------------------------------------------------------------------------

export type OutreachResponse = {
  id: string;
  enrollmentId: string;
  contactId: string;
  /** Já deve ter passado por `sanitizeDeep` — nunca conteúdo bruto sensível fora de teste. */
  bodySanitized: string;
  receivedAt: string;
  classification?: ResponseClassification;
  classificationConfidence?: number;
};

export type AIResponseCapability = OutreachAiCapabilityId;

export type AIResponseDecision = {
  classification: ResponseClassification;
  confidence: number;
  recommendHuman: boolean;
  reasoning: string;
};

export type HumanHandoffReason =
  | "interested"
  | "complex_question"
  | "objection"
  | "low_confidence"
  | "explicit_request"
  | "support_request"
  | "error"
  | "opt_out"
  | "high_priority";

export type HumanHandoffDecision = {
  shouldHandoff: boolean;
  reason: HumanHandoffReason | null;
  recommendedOwnerId?: string;
  message: string;
};

// ---------------------------------------------------------------------------
// Consentimento e elegibilidade
// ---------------------------------------------------------------------------

export type OutreachComplianceEvaluation = {
  eligible: boolean;
  blockers: string[];
  warnings: string[];
  legalBasisNote: string;
};

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

export type OutreachMetrics = {
  audienceSize: number;
  eligibleContacts: number;
  blockedContacts: number;
  scheduled: number;
  simulatedSent: number;
  delivered: number;
  read: number;
  replied: number;
  interested: number;
  qualified: number;
  transferred: number;
  optedOut: number;
  failed: number;
  completed: number;
  responseRate: number;
  qualificationRate: number;
  optOutRate: number;
  failureRate: number;
};

/** Erro estruturado — nunca mensagem genérica solta. `field` usa dot-path. */
export type OutreachValidationError = { field: string; message: string };

export type { DeploymentPlan };
