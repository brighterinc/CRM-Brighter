/**
 * Plano de rollback TEÓRICO do Brighter Provisioning Engine — Foundation v1.
 *
 * `buildRollbackPlan` NUNCA executa nada: só lista, em ordem inversa, as
 * etapas `"completed"` que declaram `supportsRollback: true` no catálogo,
 * com uma descrição textual da ação futura. Nenhum recurso compartilhado é
 * sugerido pra remoção automática (`prepare_vps` é `supportsRollback: false`
 * de propósito — ver comentário em `lib/provisioning/catalog.ts`).
 */
import { getProvisioningStepDefinition } from "./catalog";
import type { ProvisioningPlan } from "./types";

export type RollbackAction = {
  stepId: string;
  name: string;
  action: string;
};

/** Descrição textual da ação de rollback futura por etapa — nunca executada aqui. */
const ROLLBACK_ACTION_LABEL: Record<string, string> = {
  configure_application: "reverter configuração da aplicação",
  create_supabase_project: "remover projeto Supabase (só se criado exclusivamente por esta execução)",
  configure_supabase_auth: "reverter configuração de autenticação do Supabase",
  configure_supabase_storage: "remover bucket de storage criado por esta execução",
  configure_auth: "desativar autenticação da aplicação",
  create_frontend_project: "remover projeto de frontend",
  configure_frontend_environment: "limpar variáveis de ambiente do frontend",
  deploy_frontend: "remover deploy de frontend",
  install_runtime: "desinstalar runtime da VPS",
  configure_reverse_proxy: "remover configuração de proxy reverso",
  configure_redis: "desativar Redis desta instalação",
  configure_worker: "desativar worker contínuo",
  configure_scheduler: "desativar scheduler",
  configure_backup: "desativar rotina de backup",
  configure_monitoring: "desativar monitoramento",
  configure_domain: "remover configuração de domínio",
  configure_ssl: "revogar certificado SSL",
  configure_email: "desativar provedor de e-mail",
  configure_whatsapp: "desconectar número de WhatsApp",
  configure_ai_provider: "remover configuração do provedor de IA",
  create_owner: "revogar owner temporário",
};

export function buildRollbackPlan(plan: ProvisioningPlan): RollbackAction[] {
  const completedWithRollback = plan.steps.filter((s) => {
    if (s.status !== "completed") return false;
    const def = getProvisioningStepDefinition(s.stepId);
    return Boolean(def?.supportsRollback);
  });

  return [...completedWithRollback].reverse().map((s) => {
    const def = getProvisioningStepDefinition(s.stepId)!;
    return {
      stepId: s.stepId,
      name: def.name,
      action: ROLLBACK_ACTION_LABEL[s.stepId] ?? `reverter etapa "${def.name}"`,
    };
  });
}
