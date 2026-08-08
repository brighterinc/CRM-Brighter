/**
 * Catálogo comercial da Marketplace / Module Licensing Foundation — v1.
 *
 * Separado do `MODULE_CATALOG` técnico (`lib/modules/catalog.ts`) por
 * definição. `MARKETPLACE_CATALOG_SEED` é só o insumo (id do módulo técnico
 * + metadados comerciais: visibilidade, status de publicação, trial, versão)
 * — `buildMarketplaceCatalog()` é quem produz o `MarketplaceModuleDefinition`
 * final, sempre DERIVANDO `allowedPlans`/`requiredModules` do Module Engine
 * (nunca aceitos como valor solto no seed), pra divergência ser estruturalmente
 * impossível em vez de "lembrada por quem edita".
 */
import { getModuleDefinition, MODULE_CATALOG, type ModuleDefinition } from "@/lib/modules/catalog";

import type {
  MarketplaceCatalogIssue,
  MarketplaceModuleDefinition,
  MarketplaceModuleStatus,
  MarketplaceModuleVisibility,
} from "./types";

/** Insumo comercial — só o que o Module Engine NÃO já sabe. */
export type MarketplaceCatalogSeedEntry = {
  moduleId: string;
  name: string;
  description: string;
  visibility: MarketplaceModuleVisibility;
  status: MarketplaceModuleStatus;
  category: string;
  requiredModules?: string[];
  incompatibleModules?: string[];
  billingReferenceId?: string;
  trialAvailable: boolean;
  trialDurationDays?: number;
  version: string;
  enabled: boolean;
  eligibleTenantIds?: string[];
};

/**
 * Seed de demonstração — cobre módulos `stable` (publicados), `planned`
 * (`automation.campaigns`, sempre `status: "planned"` no catálogo comercial
 * também), e dois módulos `status: "planned"` no Module Engine
 * (`integration.lumina`/`integration.sphere`) marcados aqui como
 * `"retired"` comercialmente pra exercitar a regra "retired nunca aceita
 * nova licença" sem inventar módulo técnico que não existe.
 */
export const MARKETPLACE_CATALOG_SEED: MarketplaceCatalogSeedEntry[] = [
  {
    moduleId: "core.crm",
    name: "CRM",
    description: "Pipelines, leads e timeline — incluído em todo plano comercial.",
    visibility: "public",
    status: "active",
    category: "core",
    trialAvailable: false,
    version: "1.0.0",
    enabled: true,
  },
  {
    moduleId: "core.contacts",
    name: "Contatos",
    description: "Cadastro e histórico de contatos — incluído em todo plano comercial.",
    visibility: "public",
    status: "active",
    category: "core",
    trialAvailable: false,
    version: "1.0.0",
    enabled: true,
  },
  {
    moduleId: "channel.whatsapp",
    name: "WhatsApp",
    description: "Canal WhatsApp via WAHA — addon comercial pago no plano Dedicated.",
    visibility: "public",
    status: "active",
    category: "channel",
    requiredModules: ["core.contacts"],
    billingReferenceId: "addon-whatsapp",
    trialAvailable: true,
    trialDurationDays: 14,
    version: "1.2.0",
    enabled: true,
  },
  {
    moduleId: "channel.email",
    name: "E-mail",
    description: "Canal de e-mail transacional — incluído nos planos Lite/Pro/Dedicated.",
    visibility: "public",
    status: "active",
    category: "channel",
    requiredModules: ["core.contacts"],
    trialAvailable: false,
    version: "1.0.0",
    enabled: true,
  },
  {
    moduleId: "ai.agents",
    name: "Agentes de IA",
    description: "Agentes que atendem e qualificam — addon comercial opcional no Lite, incluído no Pro/Dedicated.",
    visibility: "public",
    status: "active",
    category: "ai",
    requiredModules: ["core.contacts"],
    billingReferenceId: "addon-ai-agents",
    trialAvailable: true,
    trialDurationDays: 7,
    version: "2.1.0",
    enabled: true,
  },
  {
    moduleId: "ai.memory",
    name: "Memória da IA",
    description: "Base de conhecimento e memória de longo prazo por agente.",
    visibility: "public",
    status: "active",
    category: "ai",
    requiredModules: ["ai.agents"],
    trialAvailable: false,
    version: "1.0.0",
    enabled: true,
  },
  {
    moduleId: "automation.followups",
    name: "Follow-ups automáticos",
    description: "Follow-up disparado por IA quando o lead não responde a tempo.",
    visibility: "public",
    status: "active",
    category: "automation",
    requiredModules: ["ai.agents"],
    trialAvailable: false,
    version: "1.0.0",
    enabled: true,
  },
  {
    moduleId: "automation.campaigns",
    name: "Campanhas",
    description: "Envio em massa e cadências multi-etapa — em desenvolvimento, ainda não comercializável.",
    visibility: "internal",
    status: "planned",
    category: "automation",
    requiredModules: ["core.contacts"],
    incompatibleModules: [],
    trialAvailable: false,
    version: "0.1.0",
    enabled: false,
  },
  {
    moduleId: "integration.nuvemshop",
    name: "Nuvemshop",
    description: "Sincronização de pedidos e clientes com lojas Nuvemshop — addon opcional beta.",
    visibility: "public",
    status: "beta",
    category: "integration",
    requiredModules: ["core.contacts"],
    billingReferenceId: "addon-nuvemshop",
    trialAvailable: true,
    trialDurationDays: 14,
    version: "0.9.0",
    enabled: true,
  },
  {
    moduleId: "integration.lumina",
    name: "Lumina",
    description: "Integração com o sistema parceiro Lumina — nunca implementada, retirada do catálogo comercial.",
    visibility: "internal",
    status: "retired",
    category: "integration",
    trialAvailable: false,
    version: "0.0.0",
    enabled: false,
  },
  {
    moduleId: "integration.sphere",
    name: "Sphere",
    description: "Integração com o sistema parceiro Sphere — descontinuada antes de sair de planejamento.",
    visibility: "internal",
    status: "deprecated",
    category: "integration",
    trialAvailable: false,
    version: "0.0.0",
    enabled: false,
  },
  {
    moduleId: "compliance.lgpd",
    name: "LGPD",
    description: "Anonimização, exportação e trilha de auditoria — incluído em todo plano comercial.",
    visibility: "public",
    status: "active",
    category: "compliance",
    requiredModules: ["core.contacts"],
    trialAvailable: false,
    version: "1.0.0",
    enabled: true,
  },
];

function toMarketplaceModuleDefinition(seed: MarketplaceCatalogSeedEntry, technical: ModuleDefinition | undefined): MarketplaceModuleDefinition {
  return {
    id: `mkt-${seed.moduleId}`,
    moduleId: seed.moduleId,
    name: seed.name,
    description: seed.description,
    visibility: seed.visibility,
    status: seed.status,
    category: seed.category,
    // Sempre derivado do Module Engine — [] quando o módulo técnico não existe (blocker cuida disso em validateMarketplaceCatalog).
    allowedPlans: technical?.allowedPlans ?? [],
    requiredModules: seed.requiredModules ?? technical?.dependsOn ?? [],
    incompatibleModules: seed.incompatibleModules,
    billingReferenceId: seed.billingReferenceId,
    trialAvailable: seed.trialAvailable,
    trialDurationDays: seed.trialDurationDays,
    version: seed.version,
    enabled: seed.enabled,
    eligibleTenantIds: seed.eligibleTenantIds,
  };
}

/** Constrói o catálogo comercial a partir do seed + `MODULE_CATALOG` — nunca aceita `allowedPlans` escrito à mão. */
export function buildMarketplaceCatalog(seed: MarketplaceCatalogSeedEntry[] = MARKETPLACE_CATALOG_SEED): MarketplaceModuleDefinition[] {
  return seed.map((entry) => toMarketplaceModuleDefinition(entry, getModuleDefinition(entry.moduleId)));
}

/**
 * Valida o catálogo comercial contra o Module Engine — regras do spec §4:
 * - módulo inexistente no Module Engine → blocker;
 * - módulo `planned` no catálogo comercial marcado `enabled: true` → blocker
 *   (nunca licenciável em produção);
 * - módulo comercial `deprecated` → warning;
 * - módulo comercial `retired` marcado `enabled: true` → blocker (retired
 *   nunca aceita nova licença);
 * - módulo `private` sem `eligibleTenantIds` → warning (nunca vai aparecer
 *   pra ninguém).
 */
export function validateMarketplaceCatalog(catalog: MarketplaceModuleDefinition[] = buildMarketplaceCatalog()): MarketplaceCatalogIssue[] {
  const issues: MarketplaceCatalogIssue[] = [];

  for (const mkt of catalog) {
    const technical = getModuleDefinition(mkt.moduleId);

    if (!technical) {
      issues.push({
        severity: "blocker",
        marketplaceModuleId: mkt.id,
        moduleId: mkt.moduleId,
        code: "module_not_in_module_engine",
        message: `"${mkt.moduleId}" não existe no Module Engine (MODULE_CATALOG) — não pode ser publicado comercialmente`,
      });
      continue;
    }

    if (technical.status === "planned" && mkt.enabled) {
      issues.push({
        severity: "blocker",
        marketplaceModuleId: mkt.id,
        moduleId: mkt.moduleId,
        code: "planned_module_enabled_for_sale",
        message: `"${mkt.moduleId}" é "planned" no Module Engine — não pode estar comercialmente habilitado (enabled: true)`,
      });
    }

    if (mkt.status === "retired" && mkt.enabled) {
      issues.push({
        severity: "blocker",
        marketplaceModuleId: mkt.id,
        moduleId: mkt.moduleId,
        code: "retired_module_enabled",
        message: `"${mkt.moduleId}" está "retired" comercialmente — não pode aceitar nova licença (enabled deveria ser false)`,
      });
    }

    if (mkt.status === "deprecated") {
      issues.push({
        severity: "warning",
        marketplaceModuleId: mkt.id,
        moduleId: mkt.moduleId,
        code: "deprecated_module",
        message: `"${mkt.moduleId}" está "deprecated" — ainda funciona pra quem já tem licença, mas sai de venda`,
      });
    }

    if (mkt.visibility === "private" && (!mkt.eligibleTenantIds || mkt.eligibleTenantIds.length === 0)) {
      issues.push({
        severity: "warning",
        marketplaceModuleId: mkt.id,
        moduleId: mkt.moduleId,
        code: "private_offer_without_eligible_tenants",
        message: `"${mkt.moduleId}" é "private" sem nenhum tenant elegível — nunca vai aparecer pra ninguém`,
      });
    }

    for (const requiredId of mkt.requiredModules) {
      if (!MODULE_CATALOG.some((m) => m.id === requiredId)) {
        issues.push({
          severity: "blocker",
          marketplaceModuleId: mkt.id,
          moduleId: mkt.moduleId,
          code: "required_module_missing",
          message: `"${mkt.moduleId}" declara dependência comercial de "${requiredId}", que não existe no Module Engine`,
        });
      }
    }
  }

  return issues;
}

export function resolveMarketplaceModule(moduleId: string, catalog: MarketplaceModuleDefinition[] = buildMarketplaceCatalog()): MarketplaceModuleDefinition | undefined {
  return catalog.find((m) => m.moduleId === moduleId);
}

export function deriveCatalogBlockers(catalog: MarketplaceModuleDefinition[] = buildMarketplaceCatalog()): MarketplaceCatalogIssue[] {
  return validateMarketplaceCatalog(catalog).filter((i) => i.severity === "blocker");
}

export function deriveCatalogWarnings(catalog: MarketplaceModuleDefinition[] = buildMarketplaceCatalog()): MarketplaceCatalogIssue[] {
  return validateMarketplaceCatalog(catalog).filter((i) => i.severity === "warning");
}

/** Só módulos `visibility: "public"` e `enabled: true` — nunca `internal`/`hidden`, nunca `private` (mesmo sem tenant no filtro). */
export function listPublicOffers(catalog: MarketplaceModuleDefinition[] = buildMarketplaceCatalog()): MarketplaceModuleDefinition[] {
  return catalog.filter((m) => m.visibility === "public" && m.enabled);
}

/** Público + privados elegíveis pro `tenantId` informado — nunca `internal`/`hidden`. */
export function listTenantEligibleOffers(tenantId: string, catalog: MarketplaceModuleDefinition[] = buildMarketplaceCatalog()): MarketplaceModuleDefinition[] {
  return catalog.filter((m) => {
    if (!m.enabled) return false;
    if (m.visibility === "public") return true;
    if (m.visibility === "private") return m.eligibleTenantIds?.includes(tenantId) ?? false;
    return false;
  });
}
