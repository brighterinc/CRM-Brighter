/**
 * Integrações da Outreach & AI Cadence Engine com as fundações irmãs —
 * Foundation v1. Cada fundação PRECEDENTE só pode ser CONSUMIDA (nunca
 * duplicada nem modificada): Billing decide entitlement, Monitoring informa
 * saúde de canal, Automation Engine recebe um view model pra representação
 * (nunca uma escrita real), Control Plane recebe um resumo anexado (nunca
 * se registra de volta nela — mesmo sentido único que `automation-engine`
 * já usa, confirmado por grep: `lib/control-plane/*.ts` não conhece
 * nenhuma fundação downstream).
 */
import { resolveBillingEntitlements } from "@/lib/billing/entitlements";
import type { BillingLimits, BillingPlanDefinition, BillingSubscription } from "@/lib/billing/types";
import type { Installation } from "@/lib/control-plane/types";
import type { MonitoringSnapshot } from "@/lib/monitoring/types";

import type { OutreachCadence, OutreachCampaign, OutreachChannel, OutreachEnrollment } from "./types";

// ---------------------------------------------------------------------------
// Billing — entitlement (só nega, nunca concede o que o Module Engine já
// autorizou tecnicamente — mesma regra de `resolveBillingEntitlements`)
// ---------------------------------------------------------------------------

const CHANNEL_MODULE_ID: Record<OutreachChannel, string | null> = {
  whatsapp: "channel.whatsapp",
  email: "channel.email",
  sms: null,
  internal: null,
};

export type ValidateOutreachEntitlementInput = {
  installation: { deploymentPlan: string; modules: string[] };
  subscription: BillingSubscription;
  billingPlan: BillingPlanDefinition;
  channel: OutreachChannel;
  usage?: { campaignsThisMonth?: number; messagesThisMonth?: number; whatsappConnections?: number };
};

export type OutreachEntitlementResult = {
  campaignModuleAuthorized: boolean;
  channelModuleAuthorized: boolean;
  aiModuleAuthorized: boolean;
  limits: BillingLimits;
  blockers: string[];
  warnings: string[];
};

export function validateOutreachEntitlement(input: ValidateOutreachEntitlementInput): OutreachEntitlementResult {
  const billingResult = resolveBillingEntitlements({
    installation: input.installation,
    subscription: input.subscription,
    billingPlan: input.billingPlan,
  });

  const campaignModuleAuthorized = billingResult.authorizedModules.includes("automation.campaigns");
  const channelModuleId = CHANNEL_MODULE_ID[input.channel];
  const channelModuleAuthorized = channelModuleId ? billingResult.authorizedModules.includes(channelModuleId) : true;
  const aiModuleAuthorized = billingResult.authorizedModules.includes("ai.agents");

  const blockers = [...billingResult.blockers];
  const warnings = [...billingResult.warnings];

  if (!campaignModuleAuthorized) {
    blockers.push('módulo "automation.campaigns" não autorizado — nenhuma campanha pode ser ativada nesta instalação');
  }
  if (!channelModuleAuthorized && channelModuleId) {
    blockers.push(`módulo de canal "${channelModuleId}" não autorizado pra esta campanha`);
  }

  const limits = billingResult.limits;
  const usage = input.usage ?? {};
  if (limits.campaignsPerMonth !== undefined && (usage.campaignsThisMonth ?? 0) >= limits.campaignsPerMonth) {
    blockers.push(`limite de campanhas do plano atingido (${usage.campaignsThisMonth}/${limits.campaignsPerMonth})`);
  }
  if (limits.messagesPerMonth !== undefined && (usage.messagesThisMonth ?? 0) >= limits.messagesPerMonth) {
    blockers.push(`limite de mensagens do plano atingido (${usage.messagesThisMonth}/${limits.messagesPerMonth})`);
  }
  if (limits.whatsappConnections !== undefined && (usage.whatsappConnections ?? 0) > limits.whatsappConnections) {
    warnings.push(`conexões WhatsApp acima do limite contratado (${usage.whatsappConnections}/${limits.whatsappConnections})`);
  }

  return { campaignModuleAuthorized, channelModuleAuthorized, aiModuleAuthorized, limits, blockers, warnings };
}

// ---------------------------------------------------------------------------
// Monitoring — saúde de canal (Monitoring informa; Outreach só decide se
// agenda/bloqueia)
// ---------------------------------------------------------------------------

const CHANNEL_HEALTH_CHECK_IDS: Record<OutreachChannel, string[]> = {
  whatsapp: ["whatsapp_channel_configured", "waha_available"],
  email: ["email_provider_configured"],
  sms: [],
  internal: [],
};

export type ChannelHealthEvaluation = { healthy: boolean; degraded: boolean; blockers: string[]; warnings: string[] };

export function evaluateChannelHealthForOutreach(snapshot: MonitoringSnapshot | undefined, channel: OutreachChannel): ChannelHealthEvaluation {
  const relevantIds = CHANNEL_HEALTH_CHECK_IDS[channel];
  if (relevantIds.length === 0 || !snapshot) {
    return { healthy: true, degraded: false, blockers: [], warnings: [] };
  }

  const relevantResults = snapshot.checks.filter((c) => relevantIds.includes(c.checkId));
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const result of relevantResults) {
    if (result.status === "unhealthy") blockers.push(`canal "${channel}" indisponível — check "${result.checkId}": ${result.message}`);
    else if (result.status === "degraded") warnings.push(`canal "${channel}" degradado — check "${result.checkId}": ${result.message}`);
  }

  return { healthy: blockers.length === 0, degraded: warnings.length > 0, blockers, warnings };
}

// ---------------------------------------------------------------------------
// Automation Engine — view model (NUNCA um `WorkflowDefinition`/`WorkflowRun`
// real; a Automation Engine não é modificada nem importada em runtime)
// ---------------------------------------------------------------------------

export type OutreachCadenceAsAutomationView = {
  workflowLikeId: string;
  name: string;
  triggerLike: "campaign_step_due";
  stepCount: number;
  statusLike: "active" | "paused" | "archived" | "draft";
  note: string;
};

/** View model só pra REPRESENTAÇÃO/documentação — nunca um `WorkflowDefinition` de verdade nem passível de execução pelo Automation Engine. */
export function mapCadenceToAutomationView(cadence: OutreachCadence): OutreachCadenceAsAutomationView {
  const statusLike = cadence.status === "completed" || cadence.status === "cancelled" ? "archived" : cadence.status;
  return {
    workflowLikeId: cadence.id,
    name: cadence.name,
    triggerLike: "campaign_step_due",
    stepCount: cadence.steps.length,
    statusLike,
    note: 'view model só de representação — corresponde ao trigger "campaign_step_due" do catálogo do Automation Engine (lib/automation-engine/catalog.ts), nunca um WorkflowDefinition executável.',
  };
}

export type OutreachEnrollmentAsAutomationExecutionView = {
  runLikeId: string;
  workflowLikeId: string;
  statusLike: "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
  currentStepLike?: string;
};

const ENROLLMENT_TO_RUN_STATUS: Record<OutreachEnrollment["status"], OutreachEnrollmentAsAutomationExecutionView["statusLike"]> = {
  pending: "queued",
  scheduled: "queued",
  active: "running",
  waiting: "waiting",
  responded: "waiting",
  qualified: "waiting",
  transferred: "completed",
  completed: "completed",
  cancelled: "cancelled",
  opted_out: "cancelled",
  blocked: "cancelled",
  failed: "failed",
};

export function mapEnrollmentToAutomationExecutionView(enrollment: OutreachEnrollment): OutreachEnrollmentAsAutomationExecutionView {
  return {
    runLikeId: enrollment.id,
    workflowLikeId: enrollment.cadenceId,
    statusLike: ENROLLMENT_TO_RUN_STATUS[enrollment.status],
    currentStepLike: enrollment.currentStepId,
  };
}

// ---------------------------------------------------------------------------
// Control Plane — attach (view model combinado, nunca escreve na Installation)
// ---------------------------------------------------------------------------

export type OutreachInstallationSummaryAttachment = {
  installationId: string;
  activeCampaigns: number;
  pausedCampaigns: number;
  blockedCampaigns: number;
  activeEnrollments: number;
  respondedEnrollments: number;
  optedOutEnrollments: number;
  failedEnrollments: number;
  recommendedActions: string[];
};

export function attachOutreachSummaryToInstallationSummary(
  installation: Pick<Installation, "id">,
  campaigns: OutreachCampaign[],
  enrollments: OutreachEnrollment[],
): OutreachInstallationSummaryAttachment {
  const count = (list: OutreachCampaign[], status: OutreachCampaign["status"]) => list.filter((c) => c.status === status).length;
  const countE = (list: OutreachEnrollment[], statuses: OutreachEnrollment["status"][]) => list.filter((e) => statuses.includes(e.status)).length;

  const recommendedActions: string[] = [];
  const blocked = count(campaigns, "blocked");
  if (blocked > 0) recommendedActions.push(`${blocked} campanha(s) bloqueada(s) — revisar entitlement/canal em /app/settings/outreach.`);
  const optedOut = countE(enrollments, ["opted_out"]);
  if (optedOut > 0) recommendedActions.push(`${optedOut} opt-out(s) registrado(s) — nenhuma ação necessária, opt-out já é irrevogável.`);

  return {
    installationId: installation.id,
    activeCampaigns: count(campaigns, "active"),
    pausedCampaigns: count(campaigns, "paused"),
    blockedCampaigns: blocked,
    activeEnrollments: countE(enrollments, ["active", "waiting"]),
    respondedEnrollments: countE(enrollments, ["responded", "qualified", "transferred"]),
    optedOutEnrollments: optedOut,
    failedEnrollments: countE(enrollments, ["failed"]),
    recommendedActions,
  };
}
