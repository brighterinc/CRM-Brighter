/**
 * Catálogo canônico de etapas do Brighter Provisioning Engine — Foundation v1.
 *
 * Cada `ProvisioningStepDefinition` só DECLARA o que existe — nenhuma delas
 * executa infraestrutura real (sem VPS, Supabase, Vercel, DNS, Docker,
 * systemd). `lib/provisioning/executor.ts` só tem adaptadores fake/noop
 * nesta Foundation. `dependsOn` forma um DAG: uma etapa pode listar uma
 * dependência que não existe no subconjunto selecionado pra um plano
 * específico (ex.: `deploy_frontend` só existe em Lite/Pro) — o planner
 * (`lib/provisioning/planner.ts`) ignora dependências fora do subconjunto
 * em vez de falhar, então o mesmo catálogo serve os três planos sem
 * `dependsOn` condicional.
 */
import type { ModuleInfraRequirements } from "@/lib/modules/catalog";
import type { ProvisioningStepDefinition } from "./types";

const ALL_PLANS = ["lite", "pro", "dedicated"] as const;
const LITE_PRO = ["lite", "pro"] as const;
const DEDICATED_ONLY = ["dedicated"] as const;

function step(
  def: Omit<ProvisioningStepDefinition, "idempotencyKey"> & { requiresInfra?: Array<keyof ModuleInfraRequirements> },
): ProvisioningStepDefinition {
  return { ...def, idempotencyKey: `step.${def.id}` };
}

export const PROVISIONING_STEP_CATALOG: ProvisioningStepDefinition[] = [
  // --- comuns: validação e preparação ------------------------------------
  step({
    id: "validate_tenant",
    name: "Validar tenant",
    description: "Confere que o tenant está estruturalmente válido (identidade, branding, status).",
    category: "validation",
    appliesToPlans: [...ALL_PLANS],
    required: true,
    supportsRollback: false,
  }),
  step({
    id: "validate_manifest",
    name: "Validar manifesto de implantação",
    description: "Confere que o manifesto foi gerado para este tenant e está sem blockers.",
    category: "validation",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["validate_tenant"],
    required: true,
    supportsRollback: false,
  }),
  step({
    id: "validate_modules",
    name: "Validar módulos",
    description: "Confere que todos os módulos pedidos existem no catálogo e resolvem sem dependência quebrada.",
    category: "validation",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["validate_manifest"],
    required: true,
    supportsRollback: false,
  }),
  step({
    id: "resolve_branding",
    name: "Resolver branding",
    description: "Resolve nome, logo, favicon, e-mails e razão social do cliente.",
    category: "branding",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["validate_tenant"],
    required: true,
    supportsRollback: false,
  }),
  step({
    id: "prepare_environment_template",
    name: "Preparar template de ambiente",
    description: "Monta a lista de variáveis de ambiente exigidas (só nomes, nunca valor).",
    category: "application",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["validate_modules", "resolve_branding"],
    required: true,
    supportsRollback: false,
  }),
  step({
    id: "configure_application",
    name: "Configurar aplicação",
    description: "Aplica plano, módulos habilitados e branding à configuração da aplicação.",
    category: "application",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["prepare_environment_template"],
    required: true,
    supportsRollback: true,
  }),

  // --- Supabase — aplica a TODOS os planos (database+auth são infra ------
  // mandatória nos três perfis, ver lib/deployment/profiles.ts) -----------
  step({
    id: "create_supabase_project",
    name: "Criar projeto Supabase",
    description: "Cria o projeto Supabase (Auth + Postgres) desta instalação.",
    category: "database",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["configure_application"],
    required: true,
    supportsRollback: true,
  }),
  step({
    id: "configure_supabase_auth",
    name: "Configurar Supabase Auth",
    description: "Configura provedores e políticas de autenticação do projeto Supabase.",
    category: "authentication",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["create_supabase_project"],
    required: true,
    supportsRollback: true,
  }),
  step({
    id: "configure_supabase_storage",
    name: "Configurar Supabase Storage",
    description: "Cria o bucket de mídia privado e as regras de acesso.",
    category: "storage",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["create_supabase_project"],
    required: false,
    supportsRollback: true,
    requiresInfra: ["storage"],
  }),
  step({
    id: "apply_database_schema",
    name: "Aplicar schema do banco",
    description: "Aplica o baseline versionado (RLS, extensões, tabelas tenant-aware).",
    category: "database",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["configure_supabase_auth"],
    required: true,
    supportsRollback: false,
  }),
  step({
    id: "configure_database_policies",
    name: "Configurar políticas do banco",
    description: "Confere RLS e políticas de isolamento por organização.",
    category: "database",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["apply_database_schema"],
    required: true,
    supportsRollback: false,
  }),
  step({
    id: "configure_auth",
    name: "Configurar autenticação da aplicação",
    description: "Liga a aplicação ao Supabase Auth já configurado (cookies, sessão, MFA).",
    category: "authentication",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["configure_supabase_auth"],
    required: true,
    supportsRollback: true,
  }),

  // --- Lite/Pro: frontend gerenciado --------------------------------------
  step({
    id: "create_frontend_project",
    name: "Criar projeto de frontend",
    description: "Cria o projeto de frontend hospedado (Vercel/Cloudflare).",
    category: "application",
    appliesToPlans: [...LITE_PRO],
    dependsOn: ["configure_database_policies", "configure_auth"],
    required: true,
    supportsRollback: true,
  }),
  step({
    id: "configure_frontend_environment",
    name: "Configurar ambiente do frontend",
    description: "Aplica as variáveis de ambiente do projeto de frontend.",
    category: "application",
    appliesToPlans: [...LITE_PRO],
    dependsOn: ["create_frontend_project"],
    required: true,
    supportsRollback: true,
  }),
  step({
    id: "deploy_frontend",
    name: "Implantar frontend",
    description: "Publica o build do frontend no target escolhido.",
    category: "application",
    appliesToPlans: [...LITE_PRO],
    dependsOn: ["configure_frontend_environment"],
    required: true,
    supportsRollback: true,
  }),

  // --- Dedicated: VPS própria ----------------------------------------------
  step({
    id: "prepare_vps",
    name: "Preparar VPS",
    description: "Reserva/valida a VPS dedicada desta instalação.",
    category: "application",
    appliesToPlans: [...DEDICATED_ONLY],
    dependsOn: ["configure_database_policies", "configure_auth"],
    required: true,
    // Decisão deliberada: nunca sugerir remoção automática de VPS no
    // rollback teórico — recurso caro e potencialmente compartilhado no
    // nível físico (ver docs/architecture/brighter-platform.md, seção
    // Lumina). Remoção real fica sempre com decisão manual.
    supportsRollback: false,
  }),
  step({
    id: "install_runtime",
    name: "Instalar runtime",
    description: "Instala Docker e dependências de runtime na VPS.",
    category: "application",
    appliesToPlans: [...DEDICATED_ONLY],
    dependsOn: ["prepare_vps"],
    required: true,
    supportsRollback: true,
  }),
  step({
    id: "configure_reverse_proxy",
    name: "Configurar proxy reverso",
    description: "Configura Caddy/SSL como proxy reverso da aplicação.",
    category: "application",
    appliesToPlans: [...DEDICATED_ONLY],
    dependsOn: ["install_runtime"],
    required: true,
    supportsRollback: true,
  }),
  step({
    id: "configure_redis",
    name: "Configurar Redis",
    description: "Sobe Redis/serverless-redis-http para rate limit e filas.",
    category: "application",
    appliesToPlans: [...DEDICATED_ONLY],
    dependsOn: ["install_runtime"],
    required: true,
    supportsRollback: true,
  }),
  step({
    id: "configure_worker",
    name: "Configurar worker",
    description: "Sobe o worker contínuo (event_log + cron).",
    category: "application",
    appliesToPlans: [...DEDICATED_ONLY],
    dependsOn: ["configure_redis"],
    required: true,
    supportsRollback: true,
  }),
  step({
    id: "configure_scheduler",
    name: "Configurar scheduler",
    description: "Configura os crons desta instalação (follow-up, recover-stuck-messages etc.).",
    category: "application",
    appliesToPlans: [...DEDICATED_ONLY],
    dependsOn: ["configure_worker"],
    required: true,
    supportsRollback: true,
  }),

  // --- comuns: domínio/SSL --------------------------------------------------
  step({
    id: "configure_domain",
    name: "Configurar domínio",
    description: "Aponta o domínio do cliente para o target de implantação.",
    category: "domain",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["deploy_frontend", "configure_reverse_proxy"],
    required: true,
    supportsRollback: true,
  }),
  step({
    id: "configure_ssl",
    name: "Configurar SSL",
    description: "Emite/renova o certificado SSL do domínio.",
    category: "ssl",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["configure_domain"],
    required: true,
    supportsRollback: true,
  }),

  // --- Dedicated: backup/monitoring (depois de domínio/SSL) ----------------
  step({
    id: "configure_backup",
    name: "Configurar backup",
    description: "Configura rotina de backup do banco e da VPS.",
    category: "backup",
    appliesToPlans: [...DEDICATED_ONLY],
    dependsOn: ["configure_ssl"],
    required: false,
    supportsRollback: true,
  }),
  step({
    id: "configure_monitoring",
    name: "Configurar monitoramento",
    description: "Configura observabilidade (health checks, alertas) da instalação.",
    category: "monitoring",
    appliesToPlans: [...DEDICATED_ONLY],
    dependsOn: ["configure_backup"],
    required: false,
    supportsRollback: true,
  }),

  // --- canais e IA — gating por infra do manifesto, não por plano fixo ---
  step({
    id: "configure_email",
    name: "Configurar e-mail",
    description: "Configura o provedor de e-mail transacional.",
    category: "email",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["configure_ssl", "configure_monitoring"],
    required: false,
    supportsRollback: true,
    requiresInfra: ["email"],
  }),
  step({
    id: "configure_whatsapp",
    name: "Configurar WhatsApp",
    description: "Sobe WAHA e conecta o número de WhatsApp do cliente.",
    category: "whatsapp",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["configure_ssl", "configure_monitoring"],
    required: false,
    supportsRollback: true,
    requiresInfra: ["whatsapp"],
  }),
  step({
    id: "configure_ai_provider",
    name: "Configurar provedor de IA",
    description: "Configura a chave do AI Gateway/Anthropic desta instalação.",
    category: "ai",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["configure_ssl", "configure_monitoring"],
    required: false,
    supportsRollback: true,
    requiresInfra: ["ai"],
  }),

  // --- handoff ---------------------------------------------------------------
  step({
    id: "create_owner",
    name: "Criar owner",
    description: "Cria o usuário owner inicial da organização.",
    category: "authentication",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: [
      "configure_ssl",
      "configure_monitoring",
      "configure_email",
      "configure_whatsapp",
      "configure_ai_provider",
    ],
    required: true,
    supportsRollback: true,
  }),
  step({
    id: "run_healthcheck",
    name: "Rodar healthcheck",
    description: "Confere Supabase + Redis + WAHA (quando aplicável) antes do handoff.",
    category: "monitoring",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["create_owner"],
    required: true,
    supportsRollback: false,
  }),
  step({
    id: "finalize_handoff",
    name: "Finalizar handoff",
    description: "Marca a instalação como pronta e gera o resumo de handoff.",
    category: "handoff",
    appliesToPlans: [...ALL_PLANS],
    dependsOn: ["run_healthcheck"],
    required: true,
    supportsRollback: false,
  }),
];

export function getProvisioningStepDefinition(id: string): ProvisioningStepDefinition | undefined {
  return PROVISIONING_STEP_CATALOG.find((s) => s.id === id);
}
