/**
 * Catálogo central e tipado de módulos — fonte canônica pro Module Engine.
 *
 * Cada instalação (self-host Dedicated, ou cliente White Label Lite/Pro) liga
 * um subconjunto destes módulos via env var (ver lib/modules/resolver.ts e
 * lib/modules/runtime.ts). Este arquivo só declara O QUE existe — nenhuma
 * lógica de resolução mora aqui.
 *
 * "Module Engine" é nome interno de código. Superfícies visíveis ao usuário
 * (tela de módulos, sidebar) usam linguagem neutra ("Módulos", "Recursos
 * disponíveis", "Plano de implantação") — ver docs/modules/module-engine.md.
 */

/** Modelo de implantação White Label. Ver VISION.md / docs/modules/module-engine.md. */
export type DeploymentPlan = "lite" | "pro" | "dedicated";

export const DEPLOYMENT_PLANS: DeploymentPlan[] = ["lite", "pro", "dedicated"];

/** Peças de infraestrutura que um módulo pode exigir pra funcionar de verdade. */
export type ModuleInfraRequirements = {
  database?: boolean;
  auth?: boolean;
  storage?: boolean;
  edgeFunctions?: boolean;
  redis?: boolean;
  worker?: boolean;
  scheduler?: boolean;
  whatsapp?: boolean;
  email?: boolean;
  ai?: boolean;
};

export type ModuleStatus = "stable" | "beta" | "planned";

export type ModuleDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  defaultEnabled: boolean;
  allowedPlans: DeploymentPlan[];
  requires: ModuleInfraRequirements;
  dependsOn?: string[];
  routes?: string[];
  permission?: string;
  status: ModuleStatus;
};

/** Motivo pelo qual um módulo está indisponível na instalação atual — usado pela tela de módulos. */
export type ModuleUnavailableReason =
  | "plan_not_allowed"
  | "explicitly_disabled"
  | "dependency_disabled"
  | "not_enabled_by_default";

/**
 * MODULE_CATALOG — fonte canônica.
 *
 * `defaultEnabled: true` está reservado pros módulos já em produção hoje
 * (tudo que uma instalação Dedicated existente já usa). Isso é o que garante
 * compatibilidade: uma instalação antiga, sem nenhuma env var de módulo
 * setada, cai no plano "dedicated" (fallback) e liga exatamente o que já
 * ligava. Só módulos `status: "planned"` nascem `defaultEnabled: false`.
 */
export const MODULE_CATALOG: ModuleDefinition[] = [
  // --- core -------------------------------------------------------------
  {
    id: "core.crm",
    name: "CRM",
    description: "Pipelines, leads e timeline de atividades — o núcleo do produto.",
    category: "core",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { database: true, auth: true },
    routes: ["/app/kanban"],
    status: "stable",
  },
  {
    id: "core.contacts",
    name: "Contatos",
    description: "Cadastro de contatos, dados de perfil e histórico do cliente 360.",
    category: "core",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { database: true, auth: true },
    routes: ["/app/contacts"],
    status: "stable",
  },
  {
    id: "core.pipeline",
    name: "Funis",
    description: "Funis de venda configuráveis, estágios e vocabulário por nicho.",
    category: "core",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { database: true, auth: true },
    routes: ["/app/settings/tenant/pipelines"],
    status: "stable",
  },
  {
    id: "core.tasks",
    name: "Tarefas",
    description: "Follow-ups manuais e lembretes de atividade por lead.",
    category: "core",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { database: true, auth: true },
    status: "stable",
  },
  {
    id: "core.team",
    name: "Equipe",
    description: "Convite, papéis (RBAC) e gestão de usuários do tenant.",
    category: "core",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { database: true, auth: true },
    routes: ["/app/team"],
    status: "stable",
  },

  // --- channel ------------------------------------------------------------
  {
    id: "channel.whatsapp",
    name: "WhatsApp",
    description: "Canal WhatsApp via WAHA — conexão de números, envio e recebimento.",
    category: "channel",
    defaultEnabled: true,
    // WAHA Plus exige VPS própria (Docker, engine NOWEB) — nesta primeira
    // versão o canal só existe no plano Dedicated.
    allowedPlans: ["dedicated"],
    requires: { whatsapp: true, worker: true },
    dependsOn: ["core.contacts"],
    routes: ["/app/connections"],
    status: "stable",
  },
  {
    id: "channel.email",
    name: "E-mail",
    description: "Canal de e-mail transacional e conversas por e-mail.",
    category: "channel",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { email: true },
    dependsOn: ["core.contacts"],
    status: "stable",
  },

  // --- ai -------------------------------------------------------------
  {
    id: "ai.agents",
    name: "Agentes de IA",
    description: "Agentes que atendem, qualificam e movem o funil no WhatsApp/e-mail.",
    category: "ai",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { ai: true, database: true },
    dependsOn: ["core.contacts"],
    routes: ["/app/ai/agents"],
    permission: "ai.agents.view",
    status: "stable",
  },
  {
    id: "ai.memory",
    name: "Memória da IA",
    description: "Base de conhecimento e memória de longo prazo por agente.",
    category: "ai",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { ai: true, database: true },
    dependsOn: ["ai.agents"],
    routes: ["/app/ai/memory"],
    permission: "ai.memory.view",
    status: "stable",
  },
  {
    id: "ai.rag",
    name: "RAG",
    description: "Busca semântica (embeddings pgvector) que alimenta as respostas do agente.",
    category: "ai",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { ai: true, database: true },
    dependsOn: ["ai.memory"],
    status: "stable",
  },

  // --- automation ---------------------------------------------------------
  {
    id: "automation.webhooks",
    name: "Webhooks",
    description: "Recebe contatos de fora (landing pages, formulários) e roda automações.",
    category: "automation",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { database: true },
    dependsOn: ["core.contacts"],
    routes: ["/app/webhooks"],
    permission: "webhooks.manage",
    status: "stable",
  },
  {
    id: "automation.followups",
    name: "Follow-ups automáticos",
    description: "Follow-up disparado por IA quando o lead não responde a tempo.",
    category: "automation",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { database: true, scheduler: true, ai: true },
    dependsOn: ["ai.agents"],
    routes: ["/app/ai/followups"],
    permission: "ai.agents.view",
    status: "stable",
  },
  {
    id: "automation.campaigns",
    name: "Campanhas",
    description:
      "Envio em massa e cadências multi-etapa com IA por campanha. Ver docs/modules/campaigns-and-cadences.md.",
    category: "automation",
    defaultEnabled: false,
    // Exige scheduler + worker dedicados (envio pacing/jitter, pausa ao
    // responder) — por isso amarrado ao Dedicated nesta primeira versão.
    allowedPlans: ["dedicated"],
    requires: { database: true, scheduler: true, worker: true },
    dependsOn: ["core.contacts"],
    routes: [],
    status: "planned",
  },

  // --- integration --------------------------------------------------------
  {
    id: "integration.nuvemshop",
    name: "Nuvemshop",
    description: "Sincronização de pedidos e clientes com lojas Nuvemshop.",
    category: "integration",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { database: true },
    dependsOn: ["core.contacts"],
    status: "stable",
  },
  {
    id: "integration.lumina",
    name: "Lumina",
    description: "Integração com o sistema parceiro Lumina (não implementada nesta etapa).",
    category: "integration",
    defaultEnabled: false,
    allowedPlans: ["dedicated"],
    requires: { database: true },
    routes: [],
    status: "planned",
  },
  {
    id: "integration.sphere",
    name: "Sphere",
    description: "Integração com o sistema parceiro Sphere (não implementada nesta etapa).",
    category: "integration",
    defaultEnabled: false,
    allowedPlans: ["dedicated"],
    requires: { database: true },
    routes: [],
    status: "planned",
  },

  // --- compliance / analytics ---------------------------------------------
  {
    id: "compliance.lgpd",
    name: "LGPD",
    description: "Anonimização, exportação de dados e trilha de auditoria LGPD.",
    category: "compliance",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { database: true },
    dependsOn: ["core.contacts"],
    routes: ["/app/lgpd/requests"],
    permission: "lgpd.execute_redact",
    status: "stable",
  },
  {
    id: "analytics.metrics",
    name: "Desempenho",
    description: "Métricas de funil, resposta e desempenho de atendimento.",
    category: "analytics",
    defaultEnabled: true,
    allowedPlans: ["lite", "pro", "dedicated"],
    requires: { database: true },
    routes: ["/app/metrics"],
    status: "stable",
  },
];

export function getModuleDefinition(id: string): ModuleDefinition | undefined {
  return MODULE_CATALOG.find((m) => m.id === id);
}
