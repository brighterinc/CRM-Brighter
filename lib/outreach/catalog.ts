/**
 * Catálogo canônico da Outreach & AI Cadence Engine — Foundation v1.
 *
 * Cada entrada só DECLARA o que existe — nenhuma delas envia mensagem real,
 * chama rede, ou chama IA externa. `adapters.ts` só tem implementações
 * fake/noop nesta Foundation.
 *
 * `requiredModules` referencia ids de `lib/modules/catalog.ts::MODULE_CATALOG`
 * — nunca a definição completa do módulo. TODA entrada de campanha desta
 * Foundation exige `automation.campaigns` (`status: "planned"`) — por
 * construção, NENHUMA campanha é autorizada em produção ainda (mesma regra
 * de `campaign_step_due` em `lib/automation-engine/catalog.ts` e de
 * `resolveBillingEntitlements`). Isso é esperado, não um bug.
 */
import type {
  OutreachAiCapabilityDefinition,
  OutreachBlockReasonDefinition,
  OutreachCadenceStepTypeDefinition,
  OutreachCampaignTypeDefinition,
  OutreachOptOutReasonDefinition,
  OutreachResponseClassificationDefinition,
  OutreachThrottlingPolicyDefinition,
} from "./types";

const ALL_PLANS = ["lite", "pro", "dedicated"] as const;
const DEDICATED_ONLY = ["dedicated"] as const;

export const OUTREACH_CHANNELS = ["whatsapp", "email", "sms", "internal"] as const;

// ---------------------------------------------------------------------------
// Tipos de campanha
// ---------------------------------------------------------------------------

export const OUTREACH_CAMPAIGN_TYPE_CATALOG: OutreachCampaignTypeDefinition[] = [
  {
    id: "whatsapp_broadcast_cadence",
    name: "Cadência de WhatsApp",
    description: "Campanha multi-etapa via WhatsApp com pausa automática ao receber resposta.",
    channel: "whatsapp",
    requiredModules: ["automation.campaigns", "channel.whatsapp"],
    allowedPlans: [...DEDICATED_ONLY],
    status: "planned",
    simulatedOnly: true,
    requiresAutomationEngine: true,
    requiresAiCapability: false,
    supportsPauseOnReply: true,
    supportsOptOut: true,
    supportsRetry: true,
  },
  {
    id: "email_broadcast_cadence",
    name: "Cadência de e-mail",
    description: "Campanha multi-etapa via e-mail com pausa automática ao receber resposta.",
    channel: "email",
    requiredModules: ["automation.campaigns", "channel.email"],
    allowedPlans: [...ALL_PLANS],
    status: "planned",
    simulatedOnly: true,
    requiresAutomationEngine: true,
    requiresAiCapability: false,
    supportsPauseOnReply: true,
    supportsOptOut: true,
    supportsRetry: true,
  },
  {
    id: "ai_qualification_cadence",
    name: "Cadência de qualificação com IA",
    description: "Cadência que usa classificação de resposta por IA opcional pra qualificar e recomendar transferência.",
    channel: "whatsapp",
    requiredModules: ["automation.campaigns", "channel.whatsapp", "ai.agents"],
    allowedPlans: [...DEDICATED_ONLY],
    status: "planned",
    simulatedOnly: true,
    requiresAutomationEngine: true,
    requiresAiCapability: true,
    supportsPauseOnReply: true,
    supportsOptOut: true,
    supportsRetry: true,
  },
  {
    id: "internal_notification_cadence",
    name: "Cadência interna",
    description: "Cadência de notificação interna (equipe), sem canal externo — usada em simulação/demonstração.",
    channel: "internal",
    requiredModules: ["automation.campaigns"],
    allowedPlans: [...ALL_PLANS],
    status: "planned",
    simulatedOnly: true,
    requiresAutomationEngine: true,
    requiresAiCapability: false,
    supportsPauseOnReply: false,
    supportsOptOut: false,
    supportsRetry: true,
  },
];

// ---------------------------------------------------------------------------
// Tipos de etapa de cadência
// ---------------------------------------------------------------------------

export const OUTREACH_CADENCE_STEP_TYPE_CATALOG: OutreachCadenceStepTypeDefinition[] = [
  { id: "message", name: "Mensagem", description: "Envia (simuladamente) uma mensagem de template pro contato.", supportsDelay: true, supportsTemplate: true, requiresAiCapability: null },
  { id: "email", name: "E-mail", description: "Envia (simuladamente) um e-mail de template pro contato.", supportsDelay: true, supportsTemplate: true, requiresAiCapability: null },
  { id: "delay", name: "Espera", description: "Aguarda um intervalo antes da próxima etapa — nunca um sleep real.", supportsDelay: true, supportsTemplate: false, requiresAiCapability: null },
  { id: "condition", name: "Condição", description: "Ramifica a cadência com base em uma condição sobre o contato/enrollment.", supportsDelay: false, supportsTemplate: false, requiresAiCapability: null },
  { id: "wait_for_reply", name: "Aguardar resposta", description: "Pausa o enrollment até uma resposta chegar (ou até o timeout configurado).", supportsDelay: true, supportsTemplate: false, requiresAiCapability: null },
  { id: "assign_owner", name: "Atribuir vendedor", description: "Atribui (preview) um vendedor responsável pelo enrollment.", supportsDelay: false, supportsTemplate: false, requiresAiCapability: null },
  { id: "create_task", name: "Criar tarefa", description: "Cria (preview) uma tarefa de acompanhamento pro vendedor responsável.", supportsDelay: false, supportsTemplate: false, requiresAiCapability: null },
  { id: "update_pipeline", name: "Atualizar pipeline", description: "Move (preview) o lead associado pra outra etapa do funil.", supportsDelay: false, supportsTemplate: false, requiresAiCapability: null },
  { id: "transfer_to_human", name: "Transferir para humano", description: "Encerra a automação da cadência e recomenda handoff humano.", supportsDelay: false, supportsTemplate: false, requiresAiCapability: "recommend_handoff" },
  { id: "end", name: "Fim", description: "Encerra a cadência para este enrollment.", supportsDelay: false, supportsTemplate: false, requiresAiCapability: null },
];

// ---------------------------------------------------------------------------
// Classificações de resposta
// ---------------------------------------------------------------------------

export const OUTREACH_RESPONSE_CLASSIFICATION_CATALOG: OutreachResponseClassificationDefinition[] = [
  { id: "interested", name: "Interessado", description: "Contato demonstrou interesse explícito.", stopsCadence: true, recommendsHandoff: true },
  { id: "not_interested", name: "Não interessado", description: "Contato recusou explicitamente.", stopsCadence: true, recommendsHandoff: false },
  { id: "question", name: "Pergunta", description: "Contato fez uma pergunta que a cadência não responde sozinha.", stopsCadence: true, recommendsHandoff: true },
  { id: "objection", name: "Objeção", description: "Contato levantou uma objeção comercial.", stopsCadence: true, recommendsHandoff: true },
  { id: "meeting_request", name: "Pedido de reunião", description: "Contato pediu uma reunião/demonstração.", stopsCadence: true, recommendsHandoff: true },
  { id: "support_request", name: "Pedido de suporte", description: "Contato pediu suporte, não é uma resposta comercial.", stopsCadence: true, recommendsHandoff: true },
  { id: "opt_out", name: "Opt-out", description: "Contato pediu pra parar de receber mensagens (regex STOP/PARAR/SAIR/UNSUBSCRIBE).", stopsCadence: true, recommendsHandoff: false },
  { id: "wrong_contact", name: "Contato errado", description: "Contato indicou que não é a pessoa certa.", stopsCadence: true, recommendsHandoff: false },
  { id: "spam", name: "Spam", description: "Resposta identificada como spam/irrelevante.", stopsCadence: false, recommendsHandoff: false },
  { id: "unknown", name: "Desconhecida", description: "Não foi possível classificar com confiança suficiente.", stopsCadence: true, recommendsHandoff: true },
];

// ---------------------------------------------------------------------------
// Motivos de bloqueio
// ---------------------------------------------------------------------------

export const OUTREACH_BLOCK_REASON_CATALOG: OutreachBlockReasonDefinition[] = [
  { id: "opted_out", name: "Opt-out", description: "Contato marcado como bloqueado (`contacts.is_blocked`).", category: "consent" },
  { id: "no_marketing_consent", name: "Sem consentimento de marketing", description: "Contato sem `consent.marketing.granted`.", category: "consent" },
  { id: "no_channel_address", name: "Sem endereço no canal", description: "Contato sem telefone/e-mail válido pro canal da campanha.", category: "channel" },
  { id: "channel_unavailable", name: "Canal indisponível", description: "Canal reportado como degradado/indisponível pelo Monitoring Engine.", category: "monitoring" },
  { id: "module_not_authorized", name: "Módulo não autorizado", description: "`automation.campaigns` (ou módulo de canal) não autorizado pra esta instalação.", category: "billing" },
  { id: "billing_limit_reached", name: "Limite de plano atingido", description: "Limite de campanhas/mensagens do plano de billing atingido.", category: "billing" },
  { id: "outside_sending_window", name: "Fora da janela de envio", description: "Fora do horário/dias configurados pra este canal.", category: "schedule" },
  { id: "throttled", name: "Throttled", description: "Limite de taxa (por minuto/hora/dia) atingido.", category: "throttle" },
  { id: "duplicate_enrollment", name: "Enrollment duplicado", description: "Contato já inscrito nesta campanha (idempotência).", category: "data_quality" },
];

// ---------------------------------------------------------------------------
// Políticas de throttling (referência — reflete os valores REAIS já
// documentados em `lib/automation/throttle.ts` e `CLAUDE.md` §WAHA, nunca
// números inventados)
// ---------------------------------------------------------------------------

export const OUTREACH_THROTTLING_POLICY_CATALOG: OutreachThrottlingPolicyDefinition[] = [
  {
    id: "whatsapp_one_to_one",
    name: "WhatsApp 1:1 (anti-banimento)",
    description: "Mesmo ritmo do envio individual real: 1 msg/1.2s + jitter até 800ms.",
    maxPerMinute: 50,
    maxPerHour: 3000,
    maxPerDay: 20000,
    minDelaySeconds: 1,
  },
  {
    id: "whatsapp_campaign",
    name: "WhatsApp campanha",
    description: "Ritmo mais lento pra campanha em massa: 1 msg/5s (CLAUDE.md §WAHA).",
    maxPerMinute: 12,
    maxPerHour: 720,
    maxPerDay: 5000,
    minDelaySeconds: 5,
  },
  {
    id: "email_campaign",
    name: "E-mail campanha",
    description: "Ritmo conservador de envio transacional em lote.",
    maxPerMinute: 60,
    maxPerHour: 3000,
    maxPerDay: 30000,
    minDelaySeconds: 1,
  },
];

// ---------------------------------------------------------------------------
// Motivos de opt-out
// ---------------------------------------------------------------------------

export const OUTREACH_OPT_OUT_REASON_CATALOG: OutreachOptOutReasonDefinition[] = [
  { id: "stop_keyword", name: "Palavra-chave STOP", description: "Regex STOP|PARAR|SAIR|UNSUBSCRIBE detectada no inbound (mesma regra de `lib/waha/ingest.ts`).", irrevocable: true },
  { id: "manual_block", name: "Bloqueio manual", description: "Bloqueado manualmente por um operador.", irrevocable: true },
  { id: "complaint", name: "Reclamação", description: "Contato reclamou do canal/frequência.", irrevocable: true },
  { id: "invalid_contact", name: "Contato inválido", description: "Número/e-mail inválido ou inexistente.", irrevocable: false },
];

// ---------------------------------------------------------------------------
// Capacidades de IA opcional
// ---------------------------------------------------------------------------

export const OUTREACH_AI_CAPABILITY_CATALOG: OutreachAiCapabilityDefinition[] = [
  { id: "classify_response", name: "Classificar resposta", description: "Classifica uma resposta inbound em uma `ResponseClassification`.", requiresModule: "ai.agents", simulatedOnly: true, lowConfidenceRecommendsHuman: true },
  { id: "detect_interest", name: "Detectar interesse", description: "Sinaliza interesse comercial explícito na resposta.", requiresModule: "ai.agents", simulatedOnly: true, lowConfidenceRecommendsHuman: true },
  { id: "detect_objection", name: "Detectar objeção", description: "Sinaliza objeção comercial na resposta.", requiresModule: "ai.agents", simulatedOnly: true, lowConfidenceRecommendsHuman: true },
  { id: "detect_opt_out", name: "Detectar opt-out", description: "Sinaliza pedido de opt-out — sempre delega pra `contacts.is_blocked`, nunca decide sozinho.", requiresModule: "ai.agents", simulatedOnly: true, lowConfidenceRecommendsHuman: true },
  { id: "suggest_reply", name: "Sugerir resposta", description: "Gera um rascunho de resposta — nunca envia sozinho.", requiresModule: "ai.agents", simulatedOnly: true, lowConfidenceRecommendsHuman: true },
  { id: "recommend_handoff", name: "Recomendar transferência", description: "Recomenda handoff pra um vendedor humano.", requiresModule: "ai.agents", simulatedOnly: true, lowConfidenceRecommendsHuman: true },
  { id: "generate_summary", name: "Gerar resumo", description: "Resume o histórico do enrollment pra um vendedor humano.", requiresModule: "ai.agents", simulatedOnly: true, lowConfidenceRecommendsHuman: true },
  { id: "recommend_next_action", name: "Recomendar próxima ação", description: "Sugere a próxima ação operacional pro vendedor.", requiresModule: "ai.agents", simulatedOnly: true, lowConfidenceRecommendsHuman: true },
];

// ---------------------------------------------------------------------------
// Helpers de consulta
// ---------------------------------------------------------------------------

export function getOutreachCampaignTypeDefinition(id: string): OutreachCampaignTypeDefinition | undefined {
  return OUTREACH_CAMPAIGN_TYPE_CATALOG.find((c) => c.id === id);
}

export function getOutreachCadenceStepTypeDefinition(id: string): OutreachCadenceStepTypeDefinition | undefined {
  return OUTREACH_CADENCE_STEP_TYPE_CATALOG.find((s) => s.id === id);
}

export function getOutreachResponseClassificationDefinition(id: string): OutreachResponseClassificationDefinition | undefined {
  return OUTREACH_RESPONSE_CLASSIFICATION_CATALOG.find((r) => r.id === id);
}

export function getOutreachThrottlingPolicyDefinition(id: string): OutreachThrottlingPolicyDefinition | undefined {
  return OUTREACH_THROTTLING_POLICY_CATALOG.find((t) => t.id === id);
}

export function getOutreachAiCapabilityDefinition(id: string): OutreachAiCapabilityDefinition | undefined {
  return OUTREACH_AI_CAPABILITY_CATALOG.find((a) => a.id === id);
}

/** Tipos de campanha aplicáveis a uma instalação — filtra por módulo habilitado e plano. Nunca decide autorização comercial (isso é `validation.ts`). */
export function resolveApplicableCampaignTypes(enabledModuleIds: string[], deploymentPlan: string): OutreachCampaignTypeDefinition[] {
  return OUTREACH_CAMPAIGN_TYPE_CATALOG.filter(
    (c) => c.requiredModules.every((m) => enabledModuleIds.includes(m)) && (c.allowedPlans as string[]).includes(deploymentPlan),
  );
}
