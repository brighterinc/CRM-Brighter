/**
 * Mapeamento etapa → provider/operação — Provisioning Adapters Foundation v1.
 *
 * `lib/provisioning/catalog.ts` (28 etapas) não tem noção de provider
 * concreto — é exatamente o que este arquivo resolve, sem duplicar nem
 * alterar aquele catálogo. Nem toda etapa tem provider: só as 14 declaradas
 * em `ProvisioningProvider` (`types.ts`) existem nesta Foundation — etapas
 * de validação/branding/handoff (`validate_tenant`, `create_owner`,
 * `run_healthcheck`, etc.) e etapas sem provider correspondente na lista
 * (`configure_monitoring`, `configure_ai_provider` — não há provider
 * "monitoring"/"ai" nesta Foundation) ficam deliberadamente SEM adapter.
 * Isso não é lacuna: é o `mapper.ts` reportando "adapter ausente" de forma
 * honesta (spec §8), nunca forçando um mapeamento que não existe.
 *
 * `configure_domain`/`configure_ssl` são as únicas etapas cujo provider
 * depende do `DeploymentTarget` da instalação (Vercel/Cloudflare resolvem
 * domínio+SSL automaticamente; só o target `vps` usa DNS/proxy reverso de
 * verdade) — por isso viram função, não entrada estática do mapa.
 */
import type { DeploymentTarget } from "@/lib/deployment";

import type { ProvisioningProvider } from "./types";

export type StepAdapterMapping = {
  provider: ProvisioningProvider;
  operation: string;
};

/** Etapas do Provisioning Engine cujo provider NÃO depende do `target` — mapeamento fixo. */
export const STEP_ADAPTER_MAP: Record<string, StepAdapterMapping> = {
  create_supabase_project: { provider: "supabase", operation: "project.create" },
  configure_supabase_auth: { provider: "supabase", operation: "auth.configure" },
  configure_supabase_storage: { provider: "supabase", operation: "storage.configure" },
  apply_database_schema: { provider: "supabase", operation: "database.prepare" },
  configure_database_policies: { provider: "supabase", operation: "database.policies" },

  create_frontend_project: { provider: "vercel", operation: "project.create" },
  configure_frontend_environment: { provider: "vercel", operation: "env.configure" },
  deploy_frontend: { provider: "vercel", operation: "deployment.prepare" },

  prepare_vps: { provider: "vps", operation: "server.validate" },
  install_runtime: { provider: "docker", operation: "compose.validate" },
  configure_reverse_proxy: { provider: "reverse_proxy", operation: "route.plan" },
  configure_redis: { provider: "redis", operation: "instance.plan" },
  configure_worker: { provider: "vps", operation: "service.plan" },
  configure_scheduler: { provider: "vps", operation: "service.plan" },
  configure_backup: { provider: "vps", operation: "filesystem.prepare" },

  configure_email: { provider: "email", operation: "provider.configure" },
  configure_whatsapp: { provider: "whatsapp", operation: "channel.plan" },
};

/** Etapas sem provider nesta Foundation — documentado, não um bug. */
export const UNMAPPED_PROVISIONING_STEPS: string[] = [
  "validate_tenant",
  "validate_manifest",
  "validate_modules",
  "resolve_branding",
  "prepare_environment_template",
  "configure_application",
  "configure_auth",
  "configure_monitoring",
  "configure_ai_provider",
  "create_owner",
  "run_healthcheck",
  "finalize_handoff",
];

/**
 * Resolve provider/operação de uma etapa, considerando o `target` da
 * instalação para `configure_domain`/`configure_ssl`. Retorna `undefined`
 * quando a etapa genuinamente não tem provider nesta Foundation.
 */
export function resolveStepAdapterMapping(stepId: string, target: DeploymentTarget): StepAdapterMapping | undefined {
  if (stepId === "configure_domain") {
    return target === "vps" ? { provider: "dns", operation: "record.plan" } : { provider: "vercel", operation: "domain.attach" };
  }
  if (stepId === "configure_ssl") {
    // Vercel/Cloudflare emitem SSL automaticamente ao anexar o domínio —
    // sem adapter dedicado pra esses targets nesta Foundation.
    return target === "vps" ? { provider: "reverse_proxy", operation: "tls.plan" } : undefined;
  }
  return STEP_ADAPTER_MAP[stepId];
}
