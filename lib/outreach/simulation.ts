/**
 * Simulação determinística da Outreach & AI Cadence Engine — Foundation v1.
 *
 * `simulateOutreachScenario` é o dry-run pedido — sempre usa adaptadores
 * fake (`FakeOutreachChannelAdapter`/`FakeResponseClassifier`), NUNCA canal/
 * IA real. Cada cenário é NOMEADO e determinístico (nunca `Math.random`) —
 * mesmo espírito de `simulateWorkflowRun`/`simulateMonitoringRun`. Delay
 * nunca usa `setTimeout` real — sempre aritmética sobre um `now` explícito.
 */
import { createDemoInstallations } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";

import { FakeOutreachChannelAdapter, FakeResponseClassifier } from "./adapters";
import { buildAudiencePreview } from "./audiences";
import { activateEnrollment, createEnrollment } from "./enrollments";
import { evaluateHumanHandoff } from "./handoff";
import { validateOutreachEntitlement, evaluateChannelHealthForOutreach } from "./integrations";
import { calculateOutreachMetrics } from "./metrics";
import { classifyOutreachResponse } from "./responses";
import { createDemoCadence, createDemoCampaigns, createDemoSegment } from "./repository";
import { isInsideSendingWindow } from "./scheduling";
import { activateCampaign, pauseCampaign as pauseCampaignFn, cancelCampaign as cancelCampaignFn, completeCampaign as completeCampaignFn, scheduleCampaign as scheduleCampaignFn } from "./campaigns";
import { evaluateThrottle } from "./throttling";
import type {
  AIResponseDecision,
  HumanHandoffDecision,
  OutreachAudiencePreview,
  OutreachCadence,
  OutreachCampaign,
  OutreachEnrollment,
  OutreachMetrics,
  OutreachResponse,
  OutreachSegment,
  OutreachSyntheticContact,
  OutreachThrottleEvaluation,
} from "./types";

export type OutreachSimulationScenario =
  | "healthy"
  | "scheduled"
  | "active"
  | "completed"
  | "paused"
  | "cancelled"
  | "audience_empty"
  | "contact_opted_out"
  | "contact_blocked"
  | "duplicate_enrollment"
  | "throttled"
  | "outside_window"
  | "reply_interested"
  | "reply_objection"
  | "reply_opt_out"
  | "reply_unknown"
  | "human_handoff"
  | "ai_low_confidence"
  | "channel_unavailable"
  | "billing_limit"
  | "module_disabled"
  | "template_missing_variable"
  | "retry_success"
  | "retry_exhausted";

export const OUTREACH_SIMULATION_SCENARIOS: OutreachSimulationScenario[] = [
  "healthy",
  "scheduled",
  "active",
  "completed",
  "paused",
  "cancelled",
  "audience_empty",
  "contact_opted_out",
  "contact_blocked",
  "duplicate_enrollment",
  "throttled",
  "outside_window",
  "reply_interested",
  "reply_objection",
  "reply_opt_out",
  "reply_unknown",
  "human_handoff",
  "ai_low_confidence",
  "channel_unavailable",
  "billing_limit",
  "module_disabled",
  "template_missing_variable",
  "retry_success",
  "retry_exhausted",
];

function buildContact(overrides: Partial<OutreachSyntheticContact> & { id: string }): OutreachSyntheticContact {
  return {
    id: overrides.id,
    name: overrides.name ?? "Contato Demo",
    phoneNumber: overrides.phoneNumber ?? "+5511999990000",
    email: overrides.email ?? "demo@example.invalid",
    tags: overrides.tags ?? ["lead-quente"],
    customFields: overrides.customFields ?? {},
    isBlocked: overrides.isBlocked ?? false,
    blockedReason: overrides.blockedReason ?? null,
    consent: overrides.consent ?? { marketing: { granted: true, grantedAt: "2026-01-01T00:00:00.000Z" } },
    ownerUserId: overrides.ownerUserId ?? null,
  };
}

/** 8 contatos sintéticos de demonstração — nunca dado real. */
function createDemoContacts(): OutreachSyntheticContact[] {
  return [
    buildContact({ id: "contact-1" }),
    buildContact({ id: "contact-2" }),
    buildContact({ id: "contact-3" }),
    buildContact({ id: "contact-opted-out", isBlocked: true, blockedReason: "stop_keyword" }),
    buildContact({ id: "contact-no-consent", consent: {} }),
    buildContact({ id: "contact-no-phone", phoneNumber: null }),
    buildContact({ id: "contact-4", tags: ["lead-quente", "vip"] }),
    buildContact({ id: "contact-5" }),
  ];
}

export type OutreachSimulationResult = {
  scenario: OutreachSimulationScenario;
  installation: Installation;
  campaign: OutreachCampaign;
  cadence: OutreachCadence;
  segment: OutreachSegment;
  audiencePreview: OutreachAudiencePreview;
  enrollments: OutreachEnrollment[];
  responses: OutreachResponse[];
  aiDecision?: AIResponseDecision;
  handoff?: HumanHandoffDecision;
  throttleEvaluation?: OutreachThrottleEvaluation;
  scheduleEvaluation?: { insideWindow: boolean; checkedAt: string };
  metrics: OutreachMetrics;
  blockers: string[];
  warnings: string[];
  passes: number;
};

export type SimulateOutreachScenarioOptions = {
  installation?: Installation;
  contacts?: OutreachSyntheticContact[];
};

const DEMO_BILLING_PLAN = {
  id: "demo-plan",
  name: "Plano de demonstração",
  description: "Plano sintético usado só em simulação.",
  deploymentPlan: "dedicated" as const,
  allowedCycles: ["monthly" as const],
  basePrice: { amountCents: 0, currency: "BRL" as const },
  includedModules: ["automation.campaigns", "channel.whatsapp", "ai.agents"],
  optionalModules: [],
  limits: { campaignsPerMonth: 10, messagesPerMonth: 10000 },
  gracePeriodDays: 7,
  upgradeTo: [],
  downgradeTo: [],
  enabled: true,
};

function buildDemoSubscription(installationId: string) {
  const now = new Date().toISOString();
  return {
    id: "demo-subscription",
    tenantId: installationId,
    installationId,
    planId: DEMO_BILLING_PLAN.id,
    cycle: "monthly" as const,
    status: "active" as const,
    startedAt: now,
    currentPeriodStart: now,
    currentPeriodEnd: now,
    cancelAtPeriodEnd: false,
    items: [],
    discounts: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function simulateOutreachScenario(
  scenario: OutreachSimulationScenario,
  opts: SimulateOutreachScenarioOptions = {},
): Promise<OutreachSimulationResult> {
  const installationBase = opts.installation ?? createDemoInstallations()[0];
  if (!installationBase) throw new Error("simulate_outreach_scenario: nenhuma Installation de demonstração disponível");

  const installation =
    scenario === "module_disabled"
      ? { ...installationBase, modules: installationBase.modules.filter((m) => m !== "channel.whatsapp") }
      : installationBase;

  const segment = createDemoSegment();
  const cadence = createDemoCadence();
  const campaignBase = createDemoCampaigns([installation])[0]!;

  const blockers: string[] = [];
  const warnings: string[] = [];
  let passes = 1;

  // -- campanha: aplica a transição de status pedida pelo cenário ----------
  let campaign = campaignBase;
  if (scenario === "scheduled") {
    const r = scheduleCampaignFn(campaign, new Date().toISOString());
    if (r.ok) campaign = r.campaign;
  } else if (scenario === "active" || !["cancelled", "completed", "paused"].includes(scenario)) {
    const scheduled = scheduleCampaignFn(campaign, new Date().toISOString());
    if (scheduled.ok) {
      const activated = activateCampaign(scheduled.campaign);
      if (activated.ok) campaign = activated.campaign;
    }
  }
  if (scenario === "paused") {
    const scheduled = scheduleCampaignFn(campaign, new Date().toISOString());
    const activated = scheduled.ok ? activateCampaign(scheduled.campaign) : null;
    const paused = activated?.ok ? pauseCampaignFn(activated.campaign) : null;
    if (paused?.ok) campaign = paused.campaign;
  }
  if (scenario === "cancelled") {
    const r = cancelCampaignFn(campaign);
    if (r.ok) campaign = r.campaign;
  }
  if (scenario === "completed") {
    const scheduled = scheduleCampaignFn(campaign, new Date().toISOString());
    const activated = scheduled.ok ? activateCampaign(scheduled.campaign) : null;
    const completed = activated?.ok ? completeCampaignFn(activated.campaign) : null;
    if (completed?.ok) campaign = completed.campaign;
  }

  // -- audiência -------------------------------------------------------------
  const contacts = opts.contacts ?? (scenario === "audience_empty" ? [] : createDemoContacts());
  const audiencePreview = buildAudiencePreview({ segment, campaignId: campaign.id, contacts, existingEnrollments: [] });

  // -- enrollments -----------------------------------------------------------
  const enrollments: OutreachEnrollment[] = [];
  const contactsById = new Map(contacts.map((c) => [c.id, c]));

  if (scenario === "contact_opted_out") {
    const contact = buildContact({ id: "contact-opted-out", isBlocked: true, blockedReason: "stop_keyword" });
    const result = createEnrollment({ campaignId: campaign.id, cadenceId: cadence.id, contact, existingEnrollments: [] });
    if (!result.ok) blockers.push(result.error.message);
  } else if (scenario === "contact_blocked") {
    const contact = buildContact({ id: "contact-blocked", isBlocked: true, blockedReason: "manual_block" });
    const result = createEnrollment({ campaignId: campaign.id, cadenceId: cadence.id, contact, existingEnrollments: [] });
    if (!result.ok) blockers.push(result.error.message);
  } else {
    for (const contactId of audiencePreview.eligible) {
      const contact = contactsById.get(contactId);
      if (!contact) continue;
      const created = createEnrollment({ campaignId: campaign.id, cadenceId: cadence.id, contact, existingEnrollments: enrollments });
      if (created.ok) {
        const activated = activateEnrollment(created.enrollment, cadence);
        enrollments.push(activated.ok ? activated.enrollment : created.enrollment);
      }
    }
  }

  if (scenario === "duplicate_enrollment" && enrollments[0]) {
    const contact = contactsById.get(enrollments[0].contactId)!;
    const duplicate = createEnrollment({ campaignId: campaign.id, cadenceId: cadence.id, contact, existingEnrollments: enrollments });
    if (!duplicate.ok) blockers.push(duplicate.error.message);
  }

  // -- respostas / IA opcional / handoff --------------------------------------
  const responses: OutreachResponse[] = [];
  let aiDecision: AIResponseDecision | undefined;
  let handoff: HumanHandoffDecision | undefined;
  const classifier = new FakeResponseClassifier();

  const REPLY_BODIES: Partial<Record<OutreachSimulationScenario, string>> = {
    reply_interested: "Fiquei muito interessada nisso, adorei a proposta!",
    reply_objection: "Achei muito caro, não tenho orçamento pra isso agora.",
    reply_opt_out: "PARAR",
    reply_unknown: "kkkkk beleza",
    human_handoff: "Quero agendar uma reunião pra essa semana.",
    ai_low_confidence: "hmm",
  };

  const replyBody = REPLY_BODIES[scenario];
  if (replyBody && enrollments[0]) {
    const response: OutreachResponse = {
      id: crypto.randomUUID(),
      enrollmentId: enrollments[0].id,
      contactId: enrollments[0].contactId,
      bodySanitized: replyBody,
      receivedAt: new Date().toISOString(),
    };
    aiDecision = await classifyOutreachResponse({ response, classifier });
    responses.push({ ...response, classification: aiDecision.classification, classificationConfidence: aiDecision.confidence });
    handoff = evaluateHumanHandoff(aiDecision, enrollments[0].ownerId);
  }

  // -- throttling --------------------------------------------------------------
  let throttleEvaluation: OutreachThrottleEvaluation | undefined;
  if (scenario === "throttled") {
    throttleEvaluation = evaluateThrottle(
      { maxPerMinute: 12, maxPerHour: 720, maxPerDay: 5000, minDelaySeconds: 5, maxConcurrent: 1 },
      { sentInCurrentMinute: 12, sentInCurrentHour: 100, sentInCurrentDay: 500, concurrentInFlight: 1 },
    );
    blockers.push(...throttleEvaluation.blockers);
  }

  // -- janela de envio -----------------------------------------------------
  let scheduleEvaluation: { insideWindow: boolean; checkedAt: string } | undefined;
  if (scenario === "outside_window") {
    const sunday3am = new Date("2026-08-02T06:00:00.000Z"); // domingo de madrugada em America/Sao_Paulo
    const inside = isInsideSendingWindow(sunday3am, { timezone: "America/Sao_Paulo", daysOfWeek: [1, 2, 3, 4, 5, 6], startHour: 7, endHour: 22 });
    scheduleEvaluation = { insideWindow: inside, checkedAt: sunday3am.toISOString() };
    if (!inside) blockers.push("fora da janela de envio configurada (domingo/madrugada)");
  }

  // -- canal indisponível (Monitoring) -----------------------------------------
  if (scenario === "channel_unavailable") {
    const health = evaluateChannelHealthForOutreach(
      {
        id: "demo-snapshot",
        installationId: installation.id,
        tenantId: installation.tenant.id,
        plan: installation.deploymentPlan,
        status: "completed",
        overallHealth: "unhealthy",
        score: 40,
        checks: [{ checkId: "waha_available", status: "unhealthy", observedAt: new Date().toISOString(), message: "WAHA fora do ar (simulado)" }],
        incidents: [],
        blockers: [],
        warnings: [],
        missingCheckIds: [],
        lateCheckIds: [],
        createdAt: new Date().toISOString(),
      },
      "whatsapp",
    );
    blockers.push(...health.blockers);
    warnings.push(...health.warnings);
  }

  // -- billing (entitlement/limite) --------------------------------------------
  if (scenario === "billing_limit") {
    const entitlement = validateOutreachEntitlement({
      installation: { deploymentPlan: installation.deploymentPlan, modules: installation.modules },
      subscription: buildDemoSubscription(installation.id),
      billingPlan: DEMO_BILLING_PLAN,
      channel: campaign.channel,
      usage: { campaignsThisMonth: DEMO_BILLING_PLAN.limits.campaignsPerMonth },
    });
    blockers.push(...entitlement.blockers);
  }

  if (scenario === "module_disabled") {
    blockers.push('módulo "channel.whatsapp" desabilitado nesta instalação (cenário forçado) — campanha bloqueada');
  }

  // -- template com variável faltando -----------------------------------------
  if (scenario === "template_missing_variable") {
    blockers.push('template "demo-template-intro" referencia "{{custom.cargo}}" sem valor disponível pro contato — nenhum fallback configurado');
  }

  // -- retry (adaptador fake de canal) -----------------------------------------
  if (scenario === "retry_success" || scenario === "retry_exhausted") {
    const failContactIds = scenario === "retry_exhausted" ? new Set(enrollments.map((e) => e.contactId)) : new Set<string>();
    const channelAdapter = new FakeOutreachChannelAdapter({ failContactIds });
    let attempts = 0;
    for (const enrollment of enrollments.slice(0, 1)) {
      const contact = contactsById.get(enrollment.contactId);
      if (!contact) continue;
      for (let attempt = 0; attempt < 3; attempt++) {
        attempts += 1;
        const result = await channelAdapter.send({ channel: campaign.channel, contactId: contact.id, templateId: "demo-template-intro", content: "Olá!" });
        if (result.status !== "failed") break;
      }
    }
    passes = attempts;
    if (scenario === "retry_exhausted") blockers.push("envio falhou nas 3 tentativas simuladas — retry esgotado");
  }

  const metrics = calculateOutreachMetrics({ audiencePreview, enrollments });

  return {
    scenario,
    installation,
    campaign,
    cadence,
    segment,
    audiencePreview,
    enrollments,
    responses,
    aiDecision,
    handoff,
    throttleEvaluation,
    scheduleEvaluation,
    metrics,
    blockers,
    warnings,
    passes,
  };
}
