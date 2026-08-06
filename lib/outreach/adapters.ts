/**
 * Adaptadores abstratos da Outreach & AI Cadence Engine — Foundation v1.
 *
 * Três interfaces: `OutreachChannelAdapter` (envio — nunca implementado de
 * verdade nesta Foundation), `ResponseClassifier` (classificação de
 * resposta) e `ResponseDraftGenerator` (rascunho de resposta). Só existem
 * implementações `Noop*`/`Fake*` — nenhuma toca WAHA, Meta Cloud, SMTP, SMS
 * ou IA externa (Vercel AI Gateway/Anthropic/OpenAI). Um adaptador real
 * fica pra uma fase futura ("Outreach Runtime real" — ver ROADMAP.md, mesmo
 * padrão da "Provisioning Adapters Foundation"/"Automation Adapters
 * Foundation").
 *
 * A FORMA de `ResponseClassifier`/`ResponseDraftGenerator` espelha (nunca
 * importa) as interfaces reais de `lib/agent-engine/agent/intent-classifier.ts`
 * (`IntentVerdict { intentName, confidence }`) e `draft-reply.ts`
 * (`DraftReplyResult`) — aquelas exigem DB/LLM reais (`ClassifyIntentDeps`),
 * não podem ser importadas por um engine puro/in-memory.
 */
import { getOutreachResponseClassificationDefinition } from "./catalog";
import type { AIResponseDecision, DeliveryStatus, OutreachChannel, ResponseClassification } from "./types";

// ---------------------------------------------------------------------------
// Canal (envio) — nunca implementado de verdade nesta Foundation
// ---------------------------------------------------------------------------

export type OutreachSendContext = {
  channel: OutreachChannel;
  contactId: string;
  templateId: string;
  content: string;
};

export type OutreachSendResult = { status: DeliveryStatus; externalId?: string; message: string };

export type OutreachChannelAdapter = {
  supports(channel: OutreachChannel): boolean;
  send(ctx: OutreachSendContext): Promise<OutreachSendResult>;
};

export class NoopOutreachChannelAdapter implements OutreachChannelAdapter {
  supports(): boolean {
    return true;
  }

  async send(): Promise<OutreachSendResult> {
    return { status: "simulated", message: "no-op — nenhuma mensagem real enviada nesta Foundation" };
  }
}

export type FakeOutreachChannelAdapterConfig = {
  failContactIds?: Set<string>;
};

export class FakeOutreachChannelAdapter implements OutreachChannelAdapter {
  private readonly failContactIds: Set<string>;
  private counter = 0;

  constructor(config: FakeOutreachChannelAdapterConfig = {}) {
    this.failContactIds = config.failContactIds ?? new Set();
  }

  supports(): boolean {
    return true;
  }

  async send(ctx: OutreachSendContext): Promise<OutreachSendResult> {
    this.counter += 1;
    if (this.failContactIds.has(ctx.contactId)) {
      return { status: "failed", message: "falha simulada" };
    }
    return { status: "simulated", externalId: `fake-msg-${this.counter}`, message: `envio simulado pro canal "${ctx.channel}"` };
  }
}

// ---------------------------------------------------------------------------
// Classificação de resposta — IA opcional, sempre simulada nesta Foundation
// ---------------------------------------------------------------------------

export type ResponseClassifier = {
  classify(bodySanitized: string): Promise<AIResponseDecision>;
};

const LOW_CONFIDENCE_THRESHOLD = 0.5;

export class NoopResponseClassifier implements ResponseClassifier {
  async classify(_bodySanitized: string): Promise<AIResponseDecision> {
    return { classification: "unknown", confidence: 0, recommendHuman: true, reasoning: "no-op — nenhuma IA real chamada nesta Foundation" };
  }
}

/**
 * Classificação determinística por palavra-chave — nunca `Math.random`,
 * nunca modelo real. `detect_opt_out` sempre delega a decisão final pra
 * `contacts.is_blocked` (`consent.ts`) — este classificador só SUGERE.
 */
export class FakeResponseClassifier implements ResponseClassifier {
  async classify(bodySanitized: string): Promise<AIResponseDecision> {
    const text = bodySanitized.toLowerCase();

    const rules: Array<{ pattern: RegExp; classification: ResponseClassification; confidence: number }> = [
      { pattern: /\b(stop|parar|sair|unsubscribe)\b/i, classification: "opt_out", confidence: 0.99 },
      { pattern: /\b(reuni[aã]o|agendar|demonstra[cç][aã]o)\b/i, classification: "meeting_request", confidence: 0.85 },
      { pattern: /\b(interessa|quero saber mais|gostei|manda mais informa)/i, classification: "interested", confidence: 0.8 },
      { pattern: /\b(caro|n[aã]o tenho or[cç]amento|muito caro)\b/i, classification: "objection", confidence: 0.75 },
      { pattern: /\?\s*$/, classification: "question", confidence: 0.6 },
      { pattern: /\b(n[aã]o tenho interesse|n[aã]o quero|remover)\b/i, classification: "not_interested", confidence: 0.8 },
      { pattern: /\b(pessoa errada|n[aã]o sou eu|contato errado)\b/i, classification: "wrong_contact", confidence: 0.7 },
      { pattern: /\b(suporte|problema|ajuda)\b/i, classification: "support_request", confidence: 0.7 },
    ];

    for (const rule of rules) {
      if (rule.pattern.test(text)) {
        const def = getOutreachResponseClassificationDefinition(rule.classification);
        return {
          classification: rule.classification,
          confidence: rule.confidence,
          recommendHuman: rule.confidence < LOW_CONFIDENCE_THRESHOLD || Boolean(def?.recommendsHandoff),
          reasoning: `classificador fake — casou padrão de "${rule.classification}"`,
        };
      }
    }

    return { classification: "unknown", confidence: 0.2, recommendHuman: true, reasoning: "classificador fake — nenhum padrão conhecido casou, confiança baixa" };
  }
}

// ---------------------------------------------------------------------------
// Rascunho de resposta — IA opcional, sempre simulada
// ---------------------------------------------------------------------------

export type ResponseDraftResult = { ok: true; draft: string } | { ok: false; reason: "no_capability" | "blocked" | "empty" };

export type ResponseDraftGenerator = {
  draft(bodySanitized: string, contactFirstName?: string): Promise<ResponseDraftResult>;
};

export class NoopResponseDraftGenerator implements ResponseDraftGenerator {
  async draft(_bodySanitized: string, _contactFirstName?: string): Promise<ResponseDraftResult> {
    return { ok: false, reason: "no_capability" };
  }
}

export class FakeResponseDraftGenerator implements ResponseDraftGenerator {
  async draft(bodySanitized: string, contactFirstName?: string): Promise<ResponseDraftResult> {
    if (bodySanitized.trim().length === 0) return { ok: false, reason: "empty" };
    const greeting = contactFirstName ? `Oi, ${contactFirstName}! ` : "Oi! ";
    return { ok: true, draft: `${greeting}Obrigado pela resposta — um de nossos consultores vai te retornar em breve. (rascunho simulado, nunca enviado automaticamente)` };
  }
}
