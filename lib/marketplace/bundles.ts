/**
 * Bundles comerciais — conjunto de módulos vendido junto, com obrigatórios/
 * opcionais, plano mínimo e incompatibilidades. Nomes de demonstração
 * abaixo são NEUTROS e ilustrativos — não fixam oferta comercial real da
 * Brighter (ver spec §6).
 */
import { getModuleDefinition, MODULE_CATALOG } from "@/lib/modules/catalog";

import type {
  DeploymentPlan,
  MarketplaceBundle,
  MarketplaceBundleConflict,
  MarketplaceBundlePreview,
  MarketplaceValidationError,
} from "./types";

export function validateBundle(bundle: MarketplaceBundle): MarketplaceValidationError[] {
  const errors: MarketplaceValidationError[] = [];
  if (!bundle.name.trim()) errors.push({ field: "name", message: "obrigatório" });
  if (bundle.modules.length === 0) errors.push({ field: "modules", message: "bundle precisa ter ao menos um módulo" });

  bundle.modules.forEach((m, index) => {
    if (!getModuleDefinition(m.moduleId)) {
      errors.push({ field: `modules[${index}].moduleId`, message: `"${m.moduleId}" não existe no Module Engine` });
    }
  });

  (bundle.incompatibleModules ?? []).forEach((id, index) => {
    if (bundle.modules.some((m) => m.moduleId === id)) {
      errors.push({ field: `incompatibleModules[${index}]`, message: `"${id}" está listado como incompatível E como módulo do próprio bundle` });
    }
  });

  return errors;
}

export function expandBundleModules(bundle: MarketplaceBundle): { required: string[]; optional: string[] } {
  return {
    required: bundle.modules.filter((m) => m.role === "required").map((m) => m.moduleId),
    optional: bundle.modules.filter((m) => m.role === "optional").map((m) => m.moduleId),
  };
}

/** Resolve dependências técnicas (`dependsOn`) de todos os módulos do bundle — fixed point, mesma forma de `resolveModuleAvailability`. */
export function resolveBundleDependencies(bundle: MarketplaceBundle): { resolved: string[]; missing: string[] } {
  const resolved = new Set<string>(bundle.modules.map((m) => m.moduleId));
  const missing = new Set<string>();

  let changed = true;
  let guard = 0;
  while (changed && guard < MODULE_CATALOG.length + 1) {
    changed = false;
    guard += 1;
    for (const moduleId of Array.from(resolved)) {
      const def = getModuleDefinition(moduleId);
      for (const depId of def?.dependsOn ?? []) {
        if (!resolved.has(depId)) {
          if (!getModuleDefinition(depId)) {
            missing.add(depId);
          } else {
            resolved.add(depId);
            changed = true;
          }
        }
      }
    }
  }

  return { resolved: Array.from(resolved), missing: Array.from(missing) };
}

export function deriveBundleConflicts(bundle: MarketplaceBundle): MarketplaceBundleConflict[] {
  const conflicts: MarketplaceBundleConflict[] = [];
  const moduleIds = new Set(bundle.modules.map((m) => m.moduleId));

  for (const incompatibleId of bundle.incompatibleModules ?? []) {
    if (moduleIds.has(incompatibleId)) {
      conflicts.push({
        bundleId: bundle.id,
        moduleId: incompatibleId,
        conflictsWith: bundle.id,
        reason: `"${incompatibleId}" está listado como incompatível com o próprio bundle "${bundle.id}"`,
      });
    }
  }

  return conflicts;
}

export function generateBundlePreview(bundle: MarketplaceBundle): MarketplaceBundlePreview {
  const { required, optional } = expandBundleModules(bundle);
  const { resolved, missing } = resolveBundleDependencies(bundle);
  const conflicts = deriveBundleConflicts(bundle);

  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const id of missing) {
    blockers.push(`dependência técnica "${id}" (exigida por um módulo do bundle) não existe no Module Engine`);
  }
  for (const conflict of conflicts) {
    blockers.push(conflict.reason);
  }
  for (const m of bundle.modules) {
    const def = getModuleDefinition(m.moduleId);
    if (def?.status === "planned") {
      warnings.push(`"${m.moduleId}" está "planned" no Module Engine — incluído no bundle, mas nunca licenciável em produção nesta Foundation`);
    }
  }

  return {
    bundleId: bundle.id,
    requiredModuleIds: required,
    optionalModuleIds: optional,
    resolvedModuleIds: resolved,
    conflicts,
    blockers,
    warnings,
  };
}

/**
 * Bundles de DEMONSTRAÇÃO — nomes neutros e ilustrativos (spec §6). Nunca
 * dado real da Brighter.
 */
export function createDemoBundles(): MarketplaceBundle[] {
  const now = new Date().toISOString();
  const base = (partial: Omit<MarketplaceBundle, "createdAt" | "updatedAt" | "status">): MarketplaceBundle => ({
    ...partial,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  return [
    base({
      id: "bundle-crm-essencial",
      name: "CRM Essencial",
      description: "Núcleo de vendas — pipelines, contatos e LGPD.",
      version: "1.0.0",
      minimumPlan: "lite" as DeploymentPlan,
      modules: [
        { moduleId: "core.crm", role: "required" },
        { moduleId: "core.contacts", role: "required" },
        { moduleId: "compliance.lgpd", role: "required" },
      ],
    }),
    base({
      id: "bundle-crm-whatsapp",
      name: "CRM + WhatsApp",
      description: "Núcleo de vendas com canal WhatsApp via WAHA.",
      version: "1.0.0",
      minimumPlan: "dedicated" as DeploymentPlan,
      modules: [
        { moduleId: "core.crm", role: "required" },
        { moduleId: "core.contacts", role: "required" },
        { moduleId: "channel.whatsapp", role: "required" },
        { moduleId: "ai.agents", role: "optional" },
      ],
    }),
    base({
      id: "bundle-omnichannel",
      name: "Omnichannel",
      description: "WhatsApp + e-mail + IA de atendimento num só bundle.",
      version: "1.0.0",
      minimumPlan: "dedicated" as DeploymentPlan,
      modules: [
        { moduleId: "core.contacts", role: "required" },
        { moduleId: "channel.whatsapp", role: "required" },
        { moduleId: "channel.email", role: "required" },
        { moduleId: "ai.agents", role: "required" },
        { moduleId: "ai.memory", role: "optional" },
      ],
    }),
    base({
      id: "bundle-comercial-pro",
      name: "Comercial Pro",
      description: "CRM + IA + automação de follow-up para times comerciais.",
      version: "1.0.0",
      minimumPlan: "pro" as DeploymentPlan,
      modules: [
        { moduleId: "core.crm", role: "required" },
        { moduleId: "core.contacts", role: "required" },
        { moduleId: "ai.agents", role: "required" },
        { moduleId: "automation.followups", role: "optional" },
      ],
    }),
    base({
      id: "bundle-dedicated-operations",
      name: "Dedicated Operations",
      description: "Operação completa — todos os canais e integrações estáveis.",
      version: "1.0.0",
      minimumPlan: "dedicated" as DeploymentPlan,
      modules: [
        { moduleId: "core.crm", role: "required" },
        { moduleId: "core.contacts", role: "required" },
        { moduleId: "channel.whatsapp", role: "required" },
        { moduleId: "channel.email", role: "required" },
        { moduleId: "ai.agents", role: "required" },
        { moduleId: "ai.memory", role: "required" },
        { moduleId: "integration.nuvemshop", role: "optional" },
      ],
    }),
  ];
}
