/**
 * Readiness Engine do Brighter Tenant Engine — função pura, sem I/O.
 *
 * `evaluateTenantReadiness(tenant)` nunca escreve, nunca lê `process.env`,
 * nunca chama rede. O score é determinístico: cada item **blocker** tem um
 * peso fixo somando 100 no total; o score é a soma dos pesos dos itens
 * blocker satisfeitos. Itens **warning** (ex.: logo ausente) nunca entram no
 * peso — por design, pra nunca "esconder blocker atrás do score" (doutrina
 * do pedido). `ready` é sempre `blockers.length === 0`, nunca derivado do
 * score.
 */
import { z } from "zod";

import { DEPLOYMENT_PROFILES } from "@/lib/deployment/profiles";
import { isKnownModuleId, validateDomain } from "@/lib/deployment/validation";
import { getModuleDefinition } from "@/lib/modules/catalog";

import { COMMERCIAL_STATUS_RANK } from "./status";
import type { Tenant, TenantReadiness, TenantReadinessItem } from "./types";

const emailSchema = z.string().email();
const urlSchema = z.string().url();

type ReadinessCheck = {
  item: TenantReadinessItem;
  kind: "blocker" | "warning";
  /** Só tem peso real quando `kind === "blocker"`. Soma 100 entre todos os blockers. */
  weight: number;
  satisfied: boolean;
};

function hasInfrastructureReference(tenant: Tenant): boolean {
  const infra = tenant.infrastructure;
  if (!infra) return false;
  if (tenant.plan === "dedicated") {
    return infra.target === "vps" && Boolean(infra.provider) && Boolean(infra.externalId);
  }
  return Boolean(infra.projectReference);
}

function buildChecks(tenant: Tenant): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];

  // --- Comercial (peso 15) --------------------------------------------
  checks.push({
    item: { id: "commercial.client_identified", label: "Cliente identificado", category: "commercial" },
    kind: "blocker",
    weight: 5,
    satisfied: tenant.clientName.trim().length > 0,
  });
  checks.push({
    item: { id: "commercial.contract_confirmed", label: "Contrato confirmado", category: "commercial" },
    kind: "blocker",
    weight: 5,
    satisfied: COMMERCIAL_STATUS_RANK[tenant.commercialStatus] >= COMMERCIAL_STATUS_RANK.contracted,
  });
  checks.push({
    item: { id: "commercial.responsible_defined", label: "Responsável definido", category: "commercial" },
    kind: "blocker",
    weight: 5,
    satisfied: Boolean(tenant.accountManager),
  });

  // --- Branding (peso 15) ----------------------------------------------
  checks.push({
    item: { id: "branding.name", label: "Nome de marca definido", category: "branding" },
    kind: "blocker",
    weight: 5,
    satisfied: tenant.branding.appName.trim().length > 0,
  });
  checks.push({
    item: { id: "branding.domain", label: "Domínio válido", category: "branding" },
    kind: "blocker",
    weight: 5,
    satisfied: validateDomain(tenant.domain).length === 0,
  });
  checks.push({
    item: { id: "branding.support_email", label: "E-mail de suporte válido", category: "branding" },
    kind: "blocker",
    weight: 5,
    satisfied: Boolean(tenant.branding.supportEmail) && emailSchema.safeParse(tenant.branding.supportEmail).success,
  });
  checks.push({
    item: { id: "branding.logo", label: "Logo configurado", category: "branding" },
    kind: "warning",
    weight: 0,
    satisfied: Boolean(tenant.branding.logoUrl),
  });

  // --- Infraestrutura (peso 20) -----------------------------------------
  const profile = DEPLOYMENT_PROFILES[tenant.plan];
  checks.push({
    item: { id: "infra.target_compatible", label: "Target compatível com o plano", category: "infrastructure" },
    kind: "blocker",
    weight: 8,
    satisfied: Boolean(tenant.infrastructure?.target) && profile.allowedTargets.includes(tenant.infrastructure!.target),
  });
  checks.push({
    item: {
      id: "infra.reference_present",
      label:
        tenant.plan === "dedicated"
          ? "Referência de VPS (provider + externalId)"
          : "Referência do deploy de frontend",
      category: "infrastructure",
    },
    kind: "blocker",
    weight: 12,
    satisfied: hasInfrastructureReference(tenant),
  });

  // --- Supabase (peso 15) — nunca exige segredo, o tipo não tem onde guardar ---
  checks.push({
    item: { id: "supabase.project_ref", label: "Project ref do Supabase", category: "supabase" },
    kind: "blocker",
    weight: 8,
    satisfied: Boolean(tenant.supabase?.projectRef),
  });
  checks.push({
    item: { id: "supabase.project_url", label: "URL pública do projeto Supabase", category: "supabase" },
    kind: "blocker",
    weight: 7,
    satisfied: Boolean(tenant.supabase?.projectUrl) && urlSchema.safeParse(tenant.supabase?.projectUrl).success,
  });

  // --- Módulos (peso 15) --------------------------------------------------
  checks.push({
    item: { id: "modules.all_resolved", label: "Todos os módulos pedidos existem no catálogo", category: "modules" },
    kind: "blocker",
    weight: 5,
    satisfied: tenant.requestedModules.every((id) => isKnownModuleId(id)),
  });
  checks.push({
    item: { id: "modules.no_planned", label: "Nenhum módulo habilitado ainda planejado", category: "modules" },
    kind: "blocker",
    weight: 5,
    satisfied: tenant.enabledModules.every((id) => getModuleDefinition(id)?.status !== "planned"),
  });
  const enabledSet = new Set(tenant.enabledModules);
  checks.push({
    item: { id: "modules.dependencies_satisfied", label: "Dependências dos módulos habilitados satisfeitas", category: "modules" },
    kind: "blocker",
    weight: 5,
    satisfied: tenant.enabledModules.every((id) => {
      const dependsOn = getModuleDefinition(id)?.dependsOn ?? [];
      return dependsOn.every((depId) => enabledSet.has(depId));
    }),
  });

  // --- Deployment (peso 20) ------------------------------------------------
  checks.push({
    item: { id: "deployment.manifest_present", label: "Manifesto de implantação anexado", category: "deployment" },
    kind: "blocker",
    weight: 10,
    satisfied: Boolean(tenant.manifest),
  });
  checks.push({
    item: { id: "deployment.manifest_valid", label: "Manifesto de implantação válido (sem blockers)", category: "deployment" },
    kind: "blocker",
    weight: 10,
    satisfied: Boolean(tenant.manifest?.valid),
  });

  return checks;
}

/** Consistência do `technicalStatus` declarado vs. o estado real — sempre warning, nunca blocker. */
function buildStatusConsistencyWarnings(tenant: Tenant, blockerCount: number): TenantReadinessItem[] {
  const warnings: TenantReadinessItem[] = [];

  if (tenant.technicalStatus === "ready_to_provision" && blockerCount > 0) {
    warnings.push({
      id: "status.ready_to_provision_with_blockers",
      label: `Status técnico "ready_to_provision" mas há ${blockerCount} bloqueio(s) pendente(s)`,
      category: "consistency",
    });
  }

  if (tenant.technicalStatus === "live") {
    const infraOk = hasInfrastructureReference(tenant);
    const manifestOk = Boolean(tenant.manifest?.valid);
    if (!infraOk || !manifestOk) {
      warnings.push({
        id: "status.live_without_infra_or_manifest",
        label: 'Status técnico "live" mas referência de infraestrutura e/ou manifesto de implantação estão incompletos',
        category: "consistency",
      });
    }
  }

  return warnings;
}

export function evaluateTenantReadiness(tenant: Tenant): TenantReadiness {
  const checks = buildChecks(tenant);

  const blockers = checks.filter((c) => c.kind === "blocker" && !c.satisfied).map((c) => c.item);
  const warnings = checks.filter((c) => c.kind === "warning" && !c.satisfied).map((c) => c.item);
  const completed = checks.filter((c) => c.satisfied).map((c) => c.item);

  const score = checks
    .filter((c) => c.kind === "blocker" && c.satisfied)
    .reduce((sum, c) => sum + c.weight, 0);

  warnings.push(...buildStatusConsistencyWarnings(tenant, blockers.length));

  return {
    ready: blockers.length === 0,
    score,
    blockers,
    warnings,
    completed,
  };
}
