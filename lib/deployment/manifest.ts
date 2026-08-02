/**
 * `generateDeploymentManifest` — coração do Brighter Deployment Engine.
 *
 * Função pura: recebe uma configuração comercial de cliente
 * (`DeploymentRequest`) e devolve um manifesto técnico validado
 * (`DeploymentManifest`). NÃO lê `process.env`, NÃO provisiona nada (sem
 * VPS/Supabase/Vercel/DNS/Docker), NÃO gera valor de segredo — só nomes de
 * variável. Reusa `lib/modules/resolver.ts` para decidir módulos; não
 * reimplementa essa regra.
 */
import {
  DEPLOYMENT_PLANS,
  getModuleDefinition,
  type DeploymentPlan,
  type ModuleInfraRequirements,
  type ModuleUnavailableReason,
} from "@/lib/modules/catalog";
import { resolveModuleAvailability } from "@/lib/modules/resolver";

import { getDeploymentProfile, type DeploymentProfile } from "./profiles";
import type {
  ChecklistItem,
  DeploymentEnvironment,
  DeploymentInfrastructure,
  DeploymentManifest,
  DeploymentRequest,
  DeploymentTarget,
  RejectedModule,
} from "./types";
import {
  isKnownModuleId,
  validateBranding,
  validateClientName,
  validateDomain,
  validatePlan,
  validateSlug,
  validateTarget,
} from "./validation";

const INFRA_KEYS: Array<keyof ModuleInfraRequirements> = [
  "database",
  "auth",
  "storage",
  "edgeFunctions",
  "redis",
  "worker",
  "scheduler",
  "whatsapp",
  "email",
  "ai",
];

const UNAVAILABLE_REASON_LABEL: Record<ModuleUnavailableReason, string> = {
  plan_not_allowed: "indisponível no plano contratado",
  explicitly_disabled: "desativado por configuração",
  dependency_disabled: "depende de um módulo que não está habilitado nesta configuração",
  not_enabled_by_default: "não habilitado por padrão nesta instalação",
};

// Nomes reais auditados em lib/env.ts / .env.hostgator.example — NUNCA inventados.
const BASE_REQUIRED_ENV = [
  "DEPLOYMENT_PLAN",
  "APP_NAME",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_ADMIN_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "INTERNAL_SECRET",
  "CPF_ENCRYPTION_KEY",
  "AI_CRED_AES_KEY",
  "WAHA_BYO_ENCRYPTION_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

const BASE_OPTIONAL_ENV = [
  "ENABLED_MODULES",
  "DISABLED_MODULES",
  "APP_LOGO_URL",
  "APP_FAVICON_URL",
  "APP_SUPPORT_EMAIL",
  "APP_LEGAL_NAME",
  "APP_WEBSITE_URL",
  "APP_FROM_NAME",
  "APP_FROM_EMAIL",
  "INTERNAL_CRON_SECRET",
  "IMPERSONATE_COOKIE_SECRET",
  "LGPD_SIGNING_KEY",
  "LGPD_DPO_EMAIL",
  "SENTRY_DSN",
];

function buildEnvironment(
  plan: DeploymentPlan,
  profile: DeploymentProfile,
  enabledModuleIds: string[],
  infra: ModuleInfraRequirements,
  request: DeploymentRequest,
): DeploymentEnvironment {
  const required = new Set(BASE_REQUIRED_ENV);
  const optional = new Set(BASE_OPTIONAL_ENV);

  if (infra.whatsapp) {
    required.add("WAHA_API_BASE_URL").add("WAHA_API_KEY").add("WAHA_WEBHOOK_BASE_URL");
    optional.add("WAHA_HMAC_SECRET").add("WAHA_WEBHOOK_REQUIRE_SIGNATURE");
  }
  if (infra.ai) {
    // ai.agents é default-enabled em todo plano — sem chave, o worker faz
    // no-op silencioso (lib/env.ts já loga o warning); pra um cliente pagante
    // isso é falha funcional, então entra como "required" do manifesto mesmo
    // a validação de env.ts tratando como opcional.
    required.add("AI_GATEWAY_API_KEY").add("ANTHROPIC_API_KEY");
    optional.add("OPENAI_API_KEY");
  }
  if (infra.email) {
    optional.add("RESEND_API_KEY").add("RESEND_FROM_EMAIL");
  }
  if (profile.vpsRequired) {
    required.add("DOMAIN").add("ACME_EMAIL").add("APP_IMAGE").add("SRH_TOKEN");
  }

  const generatedPublicValues: Record<string, string> = {
    APP_NAME: request.branding.appName,
    DEPLOYMENT_PLAN: plan,
    ENABLED_MODULES: enabledModuleIds.join(","),
    NEXT_PUBLIC_APP_URL: `https://${request.domain}`,
    NEXT_PUBLIC_ADMIN_URL: `https://${request.domain}`,
  };
  if (profile.vpsRequired) generatedPublicValues.DOMAIN = request.domain;
  if (request.branding.legalName) generatedPublicValues.APP_LEGAL_NAME = request.branding.legalName;
  if (request.branding.websiteUrl) generatedPublicValues.APP_WEBSITE_URL = request.branding.websiteUrl;
  if (request.branding.supportEmail) {
    generatedPublicValues.APP_SUPPORT_EMAIL = request.branding.supportEmail;
  }
  if (request.branding.logoUrl) generatedPublicValues.APP_LOGO_URL = request.branding.logoUrl;
  if (request.branding.faviconUrl) generatedPublicValues.APP_FAVICON_URL = request.branding.faviconUrl;
  if (request.branding.fromName) generatedPublicValues.APP_FROM_NAME = request.branding.fromName;
  if (request.branding.fromEmail) generatedPublicValues.APP_FROM_EMAIL = request.branding.fromEmail;

  return {
    required: Array.from(required).sort(),
    optional: Array.from(optional).sort(),
    generatedPublicValues,
  };
}

function buildChecklist(profile: DeploymentProfile, infra: ModuleInfraRequirements): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      id: "supabase-project",
      label: "Criar projeto Supabase (Auth + Postgres) e coletar URL / anon key / service role / DB URL",
      category: "infra",
      required: true,
    },
    {
      id: "dns-record",
      label: "Apontar o domínio do cliente para o target de implantação",
      category: "infra",
      required: true,
    },
    {
      id: "env-secrets",
      label:
        "Gerar os segredos criptográficos da instalação (INTERNAL_SECRET, CPF_ENCRYPTION_KEY, AI_CRED_AES_KEY, WAHA_BYO_ENCRYPTION_KEY)",
      category: "infra",
      required: true,
    },
    {
      id: "owner-bootstrap",
      label: "Criar o usuário owner inicial da organização",
      category: "infra",
      required: true,
    },
    {
      id: "branding-assets",
      label: "Confirmar logo, favicon e nome de marca do cliente",
      category: "branding",
      required: false,
    },
  ];

  if (profile.vpsRequired) {
    items.push(
      {
        id: "vps-provision",
        label: "Provisionar VPS dedicada (Docker + Caddy/SSL)",
        category: "infra",
        required: true,
      },
      {
        id: "redis-container",
        label: "Subir Redis/serverless-redis-http na VPS",
        category: "infra",
        required: true,
      },
    );
  }
  if (infra.whatsapp) {
    items.push({
      id: "waha-connect",
      label: "Subir WAHA e conectar o número de WhatsApp do cliente",
      category: "channel",
      required: true,
    });
  }
  if (infra.ai) {
    items.push({
      id: "ai-keys",
      label: "Configurar chave de IA (AI Gateway / Anthropic)",
      category: "ai",
      required: true,
    });
  }
  if (infra.email) {
    items.push({
      id: "email-provider",
      label: "Configurar Resend para e-mail transacional (opcional — sem ele, convites mostram link na UI)",
      category: "email",
      required: false,
    });
  }

  return items;
}

export function generateDeploymentManifest(request: DeploymentRequest): DeploymentManifest {
  const blockers: string[] = [];
  const warnings: string[] = [];

  blockers.push(...validateClientName(request.clientName));
  blockers.push(...validateSlug(request.clientSlug));
  blockers.push(...validateDomain(request.domain));
  blockers.push(...validatePlan(request.plan));

  const brandingResult = validateBranding(request.branding);
  blockers.push(...brandingResult.blockers);
  warnings.push(...brandingResult.warnings);

  // Plano inválido já virou blocker acima. Cai em "lite" (o mais restrito) só
  // pra conseguir montar um manifesto legível — não deveria ser instalado
  // assim, e `valid: false` deixa isso explícito pra quem consome.
  const plan: DeploymentPlan = (DEPLOYMENT_PLANS as string[]).includes(request.plan)
    ? request.plan
    : "lite";
  const profile = getDeploymentProfile(plan);

  const target: DeploymentTarget = request.target ?? profile.defaultTarget;
  if (request.target) {
    blockers.push(...validateTarget(request.target, plan));
  }

  const requestedModuleIds = Array.from(
    new Set(request.requestedModules.map((id) => id.trim()).filter((id) => id.length > 0)),
  );
  const disabledModuleIds = Array.from(
    new Set((request.disabledModules ?? []).map((id) => id.trim()).filter((id) => id.length > 0)),
  );

  const availability = resolveModuleAvailability({
    plan,
    enabledRaw: requestedModuleIds.join(","),
    disabledRaw: disabledModuleIds.join(","),
  });

  const rejectedModules: RejectedModule[] = [];

  for (const id of requestedModuleIds) {
    if (!isKnownModuleId(id)) {
      rejectedModules.push({ moduleId: id, reason: "módulo inexistente no catálogo" });
      blockers.push(`módulo inexistente: "${id}"`);
      continue;
    }
    const def = getModuleDefinition(id)!;
    if (def.status === "planned") {
      rejectedModules.push({
        moduleId: id,
        reason: "módulo ainda não implementado (status: planned)",
      });
      blockers.push(
        `módulo "${id}" ainda não está implementado (status: planned) — remova do pedido ou aguarde a próxima fase`,
      );
      continue;
    }
    const entry = availability.find((a) => a.module.id === id);
    if (entry && !entry.enabled) {
      const reasonLabel = entry.reason ? UNAVAILABLE_REASON_LABEL[entry.reason] : "motivo desconhecido";
      rejectedModules.push({ moduleId: id, reason: reasonLabel });
      blockers.push(`módulo "${id}" incompatível com o plano "${plan}": ${reasonLabel}`);
    }
  }

  const enabledModules = availability
    .filter((a) => a.enabled && a.module.status !== "planned")
    .map((a) => a.module.id);

  const infraFlags: ModuleInfraRequirements = {};
  for (const id of enabledModules) {
    const def = getModuleDefinition(id)!;
    for (const key of INFRA_KEYS) {
      if (def.requires[key]) infraFlags[key] = true;
    }
  }

  for (const key of profile.forbiddenInfra) {
    if (infraFlags[key]) {
      warnings.push(
        `infraestrutura "${key}" está marcada como proibida no perfil "${plan}", mas um módulo habilitado a exige — reveja lib/modules/catalog.ts ou lib/deployment/profiles.ts`,
      );
    }
  }

  const infrastructure: DeploymentInfrastructure = {
    ...infraFlags,
    vpsRequired: profile.vpsRequired,
    docker: profile.dockerRequired,
    proxy: profile.proxyRequired,
  };

  const environment = buildEnvironment(plan, profile, enabledModules, infraFlags, request);
  const checklist = buildChecklist(profile, infraFlags);

  return {
    client: {
      name: request.clientName,
      slug: request.clientSlug,
      domain: request.domain,
    },
    plan,
    target,
    requestedModules: requestedModuleIds,
    enabledModules,
    rejectedModules,
    infrastructure,
    environment,
    warnings,
    blockers,
    checklist,
    valid: blockers.length === 0,
  };
}
