/**
 * Audiência — Outreach & AI Cadence Engine, Foundation v1.
 *
 * `buildAudiencePreview` é o pipeline completo: casa segmento → deduplica →
 * exclui inelegíveis (opt-out, sem consentimento, sem endereço de canal, já
 * inscrito, já respondeu) → aplica `maxAudienceSize`. Nunca consulta banco
 * real — só `OutreachSyntheticContact[]` fornecido pelo chamador (teste/
 * simulação/CLI).
 */
import { deduplicateAudience, matchSegmentAudience } from "./segments";
import type { OutreachAudienceExclusion, OutreachAudiencePreview, OutreachChannel, OutreachEnrollment, OutreachIneligibilityReason, OutreachSegment, OutreachSyntheticContact } from "./types";

function hasChannelAddress(contact: OutreachSyntheticContact, channel: OutreachChannel): boolean {
  if (channel === "whatsapp" || channel === "sms") return Boolean(contact.phoneNumber);
  if (channel === "email") return Boolean(contact.email);
  return true; // "internal" não exige endereço de canal externo
}

export type ExcludeIneligibleContactsInput = {
  contacts: OutreachSyntheticContact[];
  channel: OutreachChannel;
  campaignId: string;
  /** Enrollments já existentes (qualquer campanha) — usado pra checar duplicidade/já-respondeu. */
  existingEnrollments: OutreachEnrollment[];
};

export type ExcludeIneligibleContactsResult = {
  eligible: OutreachSyntheticContact[];
  excluded: OutreachAudienceExclusion[];
};

/** Aplica, nesta ordem, as exclusões de elegibilidade: opt-out > sem consentimento > sem endereço de canal > já inscrito nesta campanha > já respondeu. Primeira regra que bate decide o motivo (nunca múltiplos motivos por contato). */
export function excludeIneligibleContacts(input: ExcludeIneligibleContactsInput): ExcludeIneligibleContactsResult {
  const { contacts, channel, campaignId, existingEnrollments } = input;
  const enrolledContactIds = new Set(existingEnrollments.filter((e) => e.campaignId === campaignId).map((e) => e.contactId));
  const respondedContactIds = new Set(existingEnrollments.filter((e) => e.status === "responded" || e.status === "qualified" || e.status === "transferred").map((e) => e.contactId));

  const eligible: OutreachSyntheticContact[] = [];
  const excluded: OutreachAudienceExclusion[] = [];

  for (const contact of contacts) {
    let reason: OutreachIneligibilityReason | null = null;

    if (contact.isBlocked) reason = "opted_out";
    else if (channel !== "internal" && !contact.consent.marketing?.granted) reason = "no_marketing_consent";
    else if (!hasChannelAddress(contact, channel)) reason = "no_channel_address";
    else if (enrolledContactIds.has(contact.id)) reason = "already_enrolled";
    else if (respondedContactIds.has(contact.id)) reason = "already_responded";

    if (reason) {
      excluded.push({ contactId: contact.id, reason });
    } else {
      eligible.push(contact);
    }
  }

  return { eligible, excluded };
}

export type BuildAudiencePreviewInput = {
  segment: OutreachSegment;
  campaignId: string;
  contacts: OutreachSyntheticContact[];
  existingEnrollments: OutreachEnrollment[];
};

export function buildAudiencePreview(input: BuildAudiencePreviewInput): OutreachAudiencePreview {
  const { segment, campaignId, contacts, existingEnrollments } = input;

  const matched = deduplicateAudience(matchSegmentAudience(segment, contacts));
  const { eligible, excluded } = excludeIneligibleContacts({
    contacts: matched,
    channel: segment.channel,
    campaignId,
    existingEnrollments,
  });

  const cappedByMaxAudienceSize = segment.maxAudienceSize !== undefined && eligible.length > segment.maxAudienceSize;
  const finalEligible = cappedByMaxAudienceSize ? eligible.slice(0, segment.maxAudienceSize) : eligible;
  const overflowExclusions: OutreachAudienceExclusion[] = cappedByMaxAudienceSize
    ? eligible.slice(segment.maxAudienceSize).map((c) => ({ contactId: c.id, reason: "excluded_by_segment" as const }))
    : [];

  return {
    segmentId: segment.id,
    totalMatched: matched.length,
    eligible: finalEligible.map((c) => c.id),
    excluded: [...excluded, ...overflowExclusions],
    eligibleCount: finalEligible.length,
    excludedCount: excluded.length + overflowExclusions.length,
    cappedByMaxAudienceSize,
    generatedAt: new Date().toISOString(),
  };
}

export type OutreachAudienceSummary = {
  totalMatched: number;
  eligibleCount: number;
  excludedCount: number;
  excludedByReason: Record<OutreachIneligibilityReason, number>;
};

const INELIGIBILITY_REASONS: OutreachIneligibilityReason[] = [
  "opted_out",
  "no_marketing_consent",
  "no_channel_address",
  "already_enrolled",
  "already_responded",
  "duplicate_in_audience",
  "excluded_by_segment",
];

export function calculateAudienceSummary(preview: OutreachAudiencePreview): OutreachAudienceSummary {
  const excludedByReason = Object.fromEntries(INELIGIBILITY_REASONS.map((r) => [r, 0])) as Record<OutreachIneligibilityReason, number>;
  for (const exclusion of preview.excluded) excludedByReason[exclusion.reason] += 1;

  return {
    totalMatched: preview.totalMatched,
    eligibleCount: preview.eligibleCount,
    excludedCount: preview.excludedCount,
    excludedByReason,
  };
}
