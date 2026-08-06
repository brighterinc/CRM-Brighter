/**
 * Repositório abstrato da Outreach & AI Cadence Engine — Foundation v1.
 *
 * `OutreachRepository` é a interface; `InMemoryOutreachRepository` é a
 * única implementação desta etapa — DEMONSTRAÇÃO/TESTE, não produção: sem
 * tabela, sem migration, sem Supabase real (mesma doutrina de
 * `InMemoryWorkflowRepository`/`InMemoryBillingRepository`). Cada instância
 * começa vazia — nunca singleton global mutável da aplicação. Persistência
 * real fica pra uma futura "Outreach Runtime real" (ver ROADMAP.md).
 */
import { createDemoInstallations } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";

import type { OutreachCadence, OutreachCampaign, OutreachEnrollment, OutreachResponse, OutreachSegment } from "./types";

export class OutreachEntityNotFoundError extends Error {
  constructor(
    public readonly entity: "campaign" | "cadence" | "enrollment" | "segment" | "response",
    public readonly id: string,
  ) {
    super(`outreach_${entity}_not_found: ${id}`);
    this.name = "OutreachEntityNotFoundError";
  }
}

export interface OutreachRepository {
  saveCampaign(campaign: OutreachCampaign): Promise<OutreachCampaign>;
  findCampaign(id: string): Promise<OutreachCampaign | null>;
  listCampaigns(installationId?: string): Promise<OutreachCampaign[]>;

  saveCadence(cadence: OutreachCadence): Promise<OutreachCadence>;
  findCadence(id: string): Promise<OutreachCadence | null>;
  listCadences(): Promise<OutreachCadence[]>;

  saveSegment(segment: OutreachSegment): Promise<OutreachSegment>;
  findSegment(id: string): Promise<OutreachSegment | null>;
  listSegments(): Promise<OutreachSegment[]>;

  saveEnrollment(enrollment: OutreachEnrollment): Promise<OutreachEnrollment>;
  findEnrollment(id: string): Promise<OutreachEnrollment | null>;
  listEnrollments(campaignId?: string): Promise<OutreachEnrollment[]>;
  findEnrollmentByIdempotencyKey(idempotencyKey: string): Promise<OutreachEnrollment | null>;

  saveResponse(response: OutreachResponse): Promise<OutreachResponse>;
  listResponses(enrollmentId?: string): Promise<OutreachResponse[]>;
}

export class InMemoryOutreachRepository implements OutreachRepository {
  private readonly campaigns = new Map<string, OutreachCampaign>();
  private readonly cadences = new Map<string, OutreachCadence>();
  private readonly segments = new Map<string, OutreachSegment>();
  private readonly enrollments = new Map<string, OutreachEnrollment>();
  private readonly responses = new Map<string, OutreachResponse>();

  constructor(
    seed: {
      campaigns?: OutreachCampaign[];
      cadences?: OutreachCadence[];
      segments?: OutreachSegment[];
      enrollments?: OutreachEnrollment[];
      responses?: OutreachResponse[];
    } = {},
  ) {
    for (const c of seed.campaigns ?? []) this.campaigns.set(c.id, c);
    for (const c of seed.cadences ?? []) this.cadences.set(c.id, c);
    for (const s of seed.segments ?? []) this.segments.set(s.id, s);
    for (const e of seed.enrollments ?? []) this.enrollments.set(e.id, e);
    for (const r of seed.responses ?? []) this.responses.set(r.id, r);
  }

  async saveCampaign(campaign: OutreachCampaign): Promise<OutreachCampaign> {
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }
  async findCampaign(id: string): Promise<OutreachCampaign | null> {
    return this.campaigns.get(id) ?? null;
  }
  async listCampaigns(installationId?: string): Promise<OutreachCampaign[]> {
    const all = Array.from(this.campaigns.values());
    return installationId ? all.filter((c) => c.installationId === installationId) : all;
  }

  async saveCadence(cadence: OutreachCadence): Promise<OutreachCadence> {
    this.cadences.set(cadence.id, cadence);
    return cadence;
  }
  async findCadence(id: string): Promise<OutreachCadence | null> {
    return this.cadences.get(id) ?? null;
  }
  async listCadences(): Promise<OutreachCadence[]> {
    return Array.from(this.cadences.values());
  }

  async saveSegment(segment: OutreachSegment): Promise<OutreachSegment> {
    this.segments.set(segment.id, segment);
    return segment;
  }
  async findSegment(id: string): Promise<OutreachSegment | null> {
    return this.segments.get(id) ?? null;
  }
  async listSegments(): Promise<OutreachSegment[]> {
    return Array.from(this.segments.values());
  }

  async saveEnrollment(enrollment: OutreachEnrollment): Promise<OutreachEnrollment> {
    this.enrollments.set(enrollment.id, enrollment);
    return enrollment;
  }
  async findEnrollment(id: string): Promise<OutreachEnrollment | null> {
    return this.enrollments.get(id) ?? null;
  }
  async listEnrollments(campaignId?: string): Promise<OutreachEnrollment[]> {
    const all = Array.from(this.enrollments.values());
    return campaignId ? all.filter((e) => e.campaignId === campaignId) : all;
  }
  async findEnrollmentByIdempotencyKey(idempotencyKey: string): Promise<OutreachEnrollment | null> {
    return Array.from(this.enrollments.values()).find((e) => e.idempotencyKey === idempotencyKey) ?? null;
  }

  async saveResponse(response: OutreachResponse): Promise<OutreachResponse> {
    this.responses.set(response.id, response);
    return response;
  }
  async listResponses(enrollmentId?: string): Promise<OutreachResponse[]> {
    const all = Array.from(this.responses.values());
    return enrollmentId ? all.filter((r) => r.enrollmentId === enrollmentId) : all;
  }
}

/**
 * Segmento de DEMONSTRAÇÃO — audiência ampla (sem filtro), canal WhatsApp.
 * Usado por testes, CLI e a tela admin. Nunca dado real.
 */
export function createDemoSegment(): OutreachSegment {
  const now = new Date().toISOString();
  return {
    id: "demo-segment-leads-quentes",
    name: "Leads quentes (últimos 30 dias)",
    description: "Segmento de demonstração — sem filtro real aplicado, só ilustra a forma.",
    channel: "whatsapp",
    filters: [{ field: "tags", op: "contains", value: "lead-quente" }],
    excludeContactIds: [],
    maxAudienceSize: 500,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Cadência de DEMONSTRAÇÃO — 3 etapas (mensagem inicial → espera 2 dias →
 * follow-up) com `stopOnReply`/`stopOnOptOut` sempre `true`. Mesmo espírito
 * de `createDemoWorkflows` (`lib/automation-engine/repository.ts`).
 */
export function createDemoCadence(): OutreachCadence {
  const now = new Date().toISOString();
  return {
    id: "demo-cadence-boas-vindas",
    name: "Cadência de primeiro contato",
    description: "Mensagem inicial, espera 2 dias, follow-up — encerra ao receber resposta ou opt-out.",
    status: "active",
    channel: "whatsapp",
    stopOnReply: true,
    stopOnOptOut: true,
    timezone: "America/Sao_Paulo",
    sendingWindow: { timezone: "America/Sao_Paulo", daysOfWeek: [1, 2, 3, 4, 5, 6], startHour: 7, endHour: 22 },
    throttlingPolicy: { maxPerMinute: 12, maxPerHour: 720, maxPerDay: 5000, minDelaySeconds: 5, maxConcurrent: 1, randomJitterSeconds: 0.8 },
    steps: [
      { id: "step-1-intro", name: "Mensagem inicial", type: "message", order: 0, templateId: "demo-template-intro", configuration: {}, onSuccess: ["step-2-wait"] },
      { id: "step-2-wait", name: "Aguardar resposta", type: "wait_for_reply", order: 1, delaySeconds: 172800, configuration: {}, onSuccess: ["step-3-followup"] },
      { id: "step-3-followup", name: "Follow-up", type: "message", order: 2, templateId: "demo-template-followup", configuration: {}, onSuccess: ["step-4-end"] },
      { id: "step-4-end", name: "Fim", type: "end", order: 3, configuration: {} },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Campanha de DEMONSTRAÇÃO — 1 por instalação de `createDemoInstallations()`
 * (`lib/control-plane/`), sempre `channel: "whatsapp"`. Usado por testes,
 * CLI e a tela admin. Nunca dado real, nunca persistido.
 */
export function createDemoCampaigns(installations: Installation[] = createDemoInstallations()): OutreachCampaign[] {
  const segment = createDemoSegment();
  const cadence = createDemoCadence();
  return installations.map((installation, index) => {
    const now = installation.createdAt;
    return {
      id: `demo-campaign-${index}-${installation.id}`,
      installationId: installation.id,
      name: `Reativação de leads — ${installation.company}`,
      description: "Campanha de demonstração — nunca envia mensagem real.",
      status: "draft" as const,
      channel: "whatsapp" as const,
      segmentId: segment.id,
      cadenceId: cadence.id,
      createdAt: now,
      updatedAt: now,
    };
  });
}
