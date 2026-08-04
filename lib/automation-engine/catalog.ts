/**
 * Catálogo canônico de gatilhos e ações do Brighter Automation Engine —
 * Foundation v1.
 *
 * Cada entrada só DECLARA o que existe — nenhuma delas dispara evento real,
 * chama rede, ou executa ação real em `crm_leads`/`contacts`/WhatsApp.
 * `lib/automation-engine/executor.ts` só tem adaptadores fake/noop nesta
 * Foundation.
 *
 * `requiresModule` referencia ids de `lib/modules/catalog.ts::MODULE_CATALOG`
 * — nunca a definição completa do módulo (que mora só no Module Engine).
 * `WORKFLOW_ACTION_CATALOG.legacyActionType` documenta a correspondência
 * conceitual com os `type` literais registrados em
 * `lib/automation/actions/*.ts` (motor legado do CRM) — verificado por
 * grep no momento em que este catálogo foi escrito, NUNCA importado.
 *
 * A entrada de gatilho `campaign_step_due` referencia `automation.campaigns`
 * (`status: "planned"` no Module Engine) DE PROPÓSITO — mesmo padrão de
 * `chatwoot_available`/`evolution_available` em
 * `lib/monitoring/catalog.ts`: fica no catálogo, mas nunca autorizado em
 * produção (`validateWorkflowDefinition` nega qualquer módulo `planned`,
 * mesma regra de `resolveBillingEntitlements`).
 */
import type { WorkflowActionCatalogEntry, WorkflowTriggerDefinition } from "./types";

const ALL_PLANS = ["lite", "pro", "dedicated"] as const;
const DEDICATED_ONLY = ["dedicated"] as const;

export const WORKFLOW_TRIGGER_CATALOG: WorkflowTriggerDefinition[] = [
  {
    id: "lead.created",
    name: "Lead criado",
    description: "Dispara quando um novo lead entra em qualquer funil.",
    category: "event",
    requiresModule: "automation.webhooks",
    appliesToPlans: [...ALL_PLANS],
  },
  {
    id: "lead.stage_changed",
    name: "Lead mudou de etapa",
    description: "Dispara quando um lead muda de etapa dentro de um funil.",
    category: "event",
    requiresModule: "automation.webhooks",
    appliesToPlans: [...ALL_PLANS],
  },
  {
    id: "lead.tag_added",
    name: "Tag adicionada ao lead",
    description: "Dispara quando uma tag é adicionada a um lead.",
    category: "event",
    requiresModule: "automation.webhooks",
    appliesToPlans: [...ALL_PLANS],
  },
  {
    id: "contact.tag_added",
    name: "Tag adicionada ao contato",
    description: "Dispara quando uma tag é adicionada a um contato.",
    category: "event",
    requiresModule: "automation.webhooks",
    appliesToPlans: [...ALL_PLANS],
  },
  {
    id: "message.received",
    name: "Mensagem recebida",
    description: "Dispara quando uma mensagem inbound chega em qualquer canal.",
    category: "event",
    requiresModule: "automation.webhooks",
    appliesToPlans: [...ALL_PLANS],
  },
  {
    id: "followup_window_elapsed",
    name: "Janela de follow-up vencida",
    description: "Dispara quando um lead não responde dentro da janela configurada.",
    category: "schedule",
    requiresModule: "automation.followups",
    appliesToPlans: [...ALL_PLANS],
  },
  {
    id: "inbound_webhook_received",
    name: "Webhook inbound recebido",
    description: "Dispara quando um contato externo (landing page, formulário) chega via webhook.",
    category: "webhook",
    requiresModule: "automation.webhooks",
    appliesToPlans: [...ALL_PLANS],
  },
  {
    id: "campaign_step_due",
    name: "Etapa de cadência de campanha vencida",
    description: "Dispara a próxima etapa de uma cadência multi-etapa de campanha.",
    category: "schedule",
    // `automation.campaigns` é "planned" no Module Engine — nunca autorizado
    // em produção nesta Foundation. Ver header do arquivo.
    requiresModule: "automation.campaigns",
    appliesToPlans: [...DEDICATED_ONLY],
  },
];

export const WORKFLOW_ACTION_CATALOG: WorkflowActionCatalogEntry[] = [
  {
    id: "add_tag",
    name: "Adicionar tag",
    description: "Adiciona uma ou mais tags ao lead ou contato do contexto.",
    category: "crm",
    requiresModule: "core.contacts",
    appliesToPlans: [...ALL_PLANS],
    supportsRetry: false,
    supportsDelay: true,
    idempotent: true,
    legacyActionType: "add_tag",
  },
  {
    id: "assign_owner",
    name: "Atribuir responsável",
    description: "Atribui um usuário da organização como responsável pelo lead.",
    category: "crm",
    requiresModule: "core.pipeline",
    appliesToPlans: [...ALL_PLANS],
    supportsRetry: false,
    supportsDelay: true,
    idempotent: true,
    legacyActionType: "assign_owner",
  },
  {
    id: "create_or_move_lead",
    name: "Criar ou mover lead",
    description: "Cria um novo lead ou move um lead existente entre etapas do mesmo funil.",
    category: "crm",
    requiresModule: "core.pipeline",
    appliesToPlans: [...ALL_PLANS],
    supportsRetry: true,
    supportsDelay: true,
    idempotent: true,
    legacyActionType: "create_or_move_lead",
  },
  {
    id: "call_webhook",
    name: "Chamar webhook",
    description: "Chama uma URL externa com o payload do contexto (POST assinado).",
    category: "integration",
    requiresModule: "automation.webhooks",
    appliesToPlans: [...ALL_PLANS],
    supportsRetry: true,
    supportsDelay: true,
    idempotent: true,
    legacyActionType: "call_webhook",
  },
  {
    id: "send_whatsapp_message",
    name: "Enviar mensagem de WhatsApp",
    description: "Envia uma mensagem de texto (com template) pro contato do contexto.",
    category: "messaging",
    requiresModule: "channel.whatsapp",
    appliesToPlans: [...ALL_PLANS],
    supportsRetry: true,
    supportsDelay: true,
    idempotent: true,
    legacyActionType: "send_whatsapp_message",
  },
];

export function getWorkflowTriggerDefinition(id: string): WorkflowTriggerDefinition | undefined {
  return WORKFLOW_TRIGGER_CATALOG.find((t) => t.id === id);
}

export function getWorkflowActionDefinition(id: string): WorkflowActionCatalogEntry | undefined {
  return WORKFLOW_ACTION_CATALOG.find((a) => a.id === id);
}

/**
 * Gatilhos/ações aplicáveis a uma instalação — filtra por módulo habilitado
 * (Module Engine) e por plano de implantação. Mesmo formato de
 * `resolveApplicableMonitoringChecks` (`lib/monitoring/evaluator.ts`): só
 * filtra, nunca decide autorização comercial (isso é `validation.ts`).
 */
export function resolveApplicableWorkflowTriggers(
  enabledModuleIds: string[],
  deploymentPlan: string,
): WorkflowTriggerDefinition[] {
  return WORKFLOW_TRIGGER_CATALOG.filter(
    (t) => enabledModuleIds.includes(t.requiresModule) && (t.appliesToPlans as string[]).includes(deploymentPlan),
  );
}

export function resolveApplicableWorkflowActions(
  enabledModuleIds: string[],
  deploymentPlan: string,
): WorkflowActionCatalogEntry[] {
  return WORKFLOW_ACTION_CATALOG.filter(
    (a) => enabledModuleIds.includes(a.requiresModule) && (a.appliesToPlans as string[]).includes(deploymentPlan),
  );
}
