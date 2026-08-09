/** Blueprint Supabase — declara capabilities/rollback teórico, nunca chama `api.supabase.com`. */
import { createTableDrivenProvisioningProviderAdapter } from "./base";

export const SupabaseProvisioningProviderAdapter = createTableDrivenProvisioningProviderAdapter("supabase", {
  "project.create": {
    message: "Criaria o projeto Supabase (Auth + Postgres) desta instalação.",
    rollback: ["remover projeto Supabase (só se criado exclusivamente por esta execução)"],
  },
  "auth.configure": {
    message: "Configuraria provedores e políticas de autenticação do projeto Supabase.",
    rollback: ["reverter configuração de autenticação do Supabase"],
  },
  "auth.link": {
    message: "Ligaria a aplicação ao Supabase Auth já configurado (cookies, sessão, MFA).",
    rollback: ["desativar autenticação da aplicação"],
  },
  "database.prepare": {
    message: "Aplicaria o baseline versionado (RLS, extensões, tabelas tenant-aware).",
    rollback: [],
  },
  "database.policies": {
    message: "Conferiria RLS e políticas de isolamento por organização.",
    rollback: [],
  },
  "storage.configure": {
    message: "Criaria o bucket de mídia privado e as regras de acesso.",
    rollback: ["remover bucket de storage criado por esta execução"],
    extra: { bucket: "whatsapp-media" },
  },
  "edge_functions.prepare": {
    message: "Prepararia as edge functions exigidas pela instalação.",
    rollback: ["remover edge functions criadas por esta execução"],
  },
});
