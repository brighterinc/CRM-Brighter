/**
 * Perfis canônicos de implantação (Lite/Pro/Dedicated) do Brighter Deployment
 * Engine. Cada perfil só descreve TARGETS e INFRAESTRUTURA DE PLATAFORMA
 * (VPS/Docker/proxy, Redis dedicado, worker contínuo) — NÃO redecide quais
 * módulos um plano permite. Essa regra já existe em
 * `lib/modules/catalog.ts` (`ModuleDefinition.allowedPlans`) e é resolvida
 * por `lib/modules/resolver.ts`; duplicá-la aqui divergiria cedo ou tarde.
 *
 * `forbiddenInfra` é uma rede de segurança DECLARATIVA: hoje nenhum módulo
 * permitido em Lite/Pro declara `requires.redis`/`requires.worker`, então a
 * lista nunca deveria disparar. Se o catálogo mudar e um módulo Lite passar a
 * exigir Redis contínuo, `generateDeploymentManifest` emite um WARNING (não
 * um blocker — quem decidiu isso foi o catálogo, não este arquivo).
 */
import type { DeploymentPlan, ModuleInfraRequirements } from "@/lib/modules/catalog";
import type { DeploymentTarget } from "./types";

export type DeploymentProfile = {
  plan: DeploymentPlan;
  label: string;
  allowedTargets: DeploymentTarget[];
  defaultTarget: DeploymentTarget;
  vpsRequired: boolean;
  dockerRequired: boolean;
  proxyRequired: boolean;
  /** Infra que toda instalação deste plano tem, independente dos módulos pedidos. */
  mandatoryInfra: Array<keyof ModuleInfraRequirements>;
  /** Rede de segurança — ver doc do arquivo. Não é a fonte de verdade de módulo. */
  forbiddenInfra: Array<keyof ModuleInfraRequirements>;
  /** Observações operacionais — usadas na tela e no CLI, texto pra humano. */
  notes: string[];
};

export const DEPLOYMENT_PROFILES: Record<DeploymentPlan, DeploymentProfile> = {
  lite: {
    plan: "lite",
    label: "Lite",
    allowedTargets: ["vercel", "cloudflare"],
    defaultTarget: "vercel",
    vpsRequired: false,
    dockerRequired: false,
    proxyRequired: false,
    mandatoryInfra: ["database", "auth"],
    forbiddenInfra: ["redis", "worker", "whatsapp"],
    notes: [
      "Frontend hospedado (Vercel/Cloudflare) — sem VPS.",
      "Supabase Auth + Postgres obrigatórios; Storage e Edge Functions são opcionais.",
      "Sem Redis dedicado nem worker contínuo — módulos que exigem isso (ex.: channel.whatsapp) já são bloqueados pelo Module Engine no plano lite.",
    ],
  },
  pro: {
    plan: "pro",
    label: "Pro",
    allowedTargets: ["vercel", "cloudflare"],
    defaultTarget: "vercel",
    vpsRequired: false,
    dockerRequired: false,
    proxyRequired: false,
    mandatoryInfra: ["database", "auth"],
    forbiddenInfra: ["whatsapp"],
    notes: [
      "Frontend hospedado, sem VPS obrigatória por padrão.",
      "Edge Functions, cron gerenciado e integrações gerenciadas permitidos.",
      "Worker contínuo não é obrigatório — automações usam cron/edge, não um processo 24/7.",
    ],
  },
  dedicated: {
    plan: "dedicated",
    label: "Dedicated",
    allowedTargets: ["vps"],
    defaultTarget: "vps",
    vpsRequired: true,
    dockerRequired: true,
    proxyRequired: true,
    mandatoryInfra: ["database", "auth"],
    forbiddenInfra: [],
    notes: [
      "VPS exclusiva com Docker + Caddy/SSL — obrigatória.",
      "Redis, worker e scheduler contínuos disponíveis nesta VPS.",
      "Único plano com canais como WhatsApp (WAHA) e IA contínua.",
      "Backups e monitoramento são responsabilidade da VPS do cliente.",
    ],
  },
};

export function getDeploymentProfile(plan: DeploymentPlan): DeploymentProfile {
  return DEPLOYMENT_PROFILES[plan];
}
