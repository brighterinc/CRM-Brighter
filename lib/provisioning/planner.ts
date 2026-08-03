/**
 * `generateProvisioningPlan` — coração do Brighter Provisioning Engine.
 *
 * Função pura: recebe um `Tenant` (`lib/tenants/`) + o `DeploymentManifest`
 * já anexado a ele (`lib/deployment/`) e devolve um `ProvisioningPlan`
 * ordenado. NÃO lê `process.env`, NÃO persiste, NÃO executa nada. Reusa
 * `lib/provisioning/validation.ts` para compatibilidade/prontidão/ciclo —
 * não reimplementa nenhuma dessas checagens aqui.
 */
import { createHash } from "node:crypto";

import type { Tenant } from "@/lib/tenants/types";

import { PROVISIONING_STEP_CATALOG } from "./catalog";
import type {
  DeploymentManifest,
  ProvisioningPlan,
  ProvisioningStepDefinition,
  ProvisioningStepState,
} from "./types";
import {
  detectCircularStepDependencies,
  validateStepCatalog,
  validateTenantManifestCompatibility,
  validateTenantReadinessForProvisioning,
} from "./validation";

export type GenerateProvisioningPlanInput = {
  tenant: Tenant;
  manifest: DeploymentManifest;
  /** Só para teste — o catálogo real é sempre `PROVISIONING_STEP_CATALOG`. */
  catalog?: ProvisioningStepDefinition[];
};

/**
 * Só campos NÃO sensíveis — nunca token, chave, senha, connection string.
 * Mesmo input (mesma ordem de módulos habilitados) sempre gera o mesmo hash.
 */
export function calculateProvisioningFingerprint(input: {
  tenantId: string;
  tenantSlug: string;
  plan: string;
  target: string;
  domain: string;
  enabledModules: string[];
  appName: string;
}): string {
  const stable = {
    tenantId: input.tenantId,
    tenantSlug: input.tenantSlug,
    plan: input.plan,
    target: input.target,
    domain: input.domain,
    enabledModules: [...input.enabledModules].sort(),
    appName: input.appName,
  };
  const hash = createHash("sha256").update(JSON.stringify(stable)).digest("hex");
  return `prov_${hash.slice(0, 16)}`;
}

/** Seleciona as etapas do catálogo aplicáveis a este manifesto (plano + infra exigida). */
function selectApplicableSteps(
  catalog: ProvisioningStepDefinition[],
  manifest: DeploymentManifest,
): ProvisioningStepDefinition[] {
  return catalog.filter((s) => {
    if (!s.appliesToPlans.includes(manifest.plan)) return false;
    if (!s.requiresInfra || s.requiresInfra.length === 0) return true;
    return s.requiresInfra.every((key) => Boolean(manifest.infrastructure[key]));
  });
}

/**
 * Kahn's algorithm restrito ao subconjunto selecionado — uma dependência que
 * aponta pra uma etapa fora do subconjunto (ex.: `deploy_frontend` num plano
 * Dedicated) é ignorada em vez de travar a ordenação.
 */
function orderSteps(steps: ProvisioningStepDefinition[]): ProvisioningStepDefinition[] {
  const ids = new Set(steps.map((s) => s.id));
  const byId = new Map(steps.map((s) => [s.id, s]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const s of steps) {
    const deps = (s.dependsOn ?? []).filter((depId) => ids.has(depId));
    inDegree.set(s.id, deps.length);
    for (const depId of deps) {
      dependents.set(depId, [...(dependents.get(depId) ?? []), s.id]);
    }
  }

  // Fila estável — mantém a ordem de definição do catálogo entre elegíveis
  // simultâneos, pra ordenação determinística.
  const queue = steps.filter((s) => inDegree.get(s.id) === 0).map((s) => s.id);
  const ordered: ProvisioningStepDefinition[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(byId.get(id)!);
    for (const depId of dependents.get(id) ?? []) {
      const remaining = (inDegree.get(depId) ?? 0) - 1;
      inDegree.set(depId, remaining);
      if (remaining === 0) queue.push(depId);
    }
  }

  return ordered;
}

export function generateProvisioningPlan({
  tenant,
  manifest,
  catalog = PROVISIONING_STEP_CATALOG,
}: GenerateProvisioningPlanInput): ProvisioningPlan {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Bug de catálogo é blocker crítico — nunca deveria disparar em produção
  // (mesmo espírito de `forbiddenInfra` em lib/deployment/profiles.ts).
  blockers.push(...validateStepCatalog(catalog));
  const cycle = detectCircularStepDependencies(catalog);
  if (cycle) {
    blockers.push(`dependência circular no catálogo de etapas: ${cycle.join(" → ")}`);
  }

  blockers.push(...validateTenantManifestCompatibility(tenant, manifest));

  const readinessResult = validateTenantReadinessForProvisioning(tenant);
  blockers.push(...readinessResult.blockers);
  warnings.push(...readinessResult.warnings);

  if (!manifest.valid) {
    blockers.push(...manifest.blockers.map((b) => `manifesto de implantação inválido: ${b}`));
  }
  warnings.push(...manifest.warnings.map((w) => `aviso do manifesto de implantação: ${w}`));

  const applicable = selectApplicableSteps(catalog, manifest);
  const ordered = orderSteps(applicable);

  const hasBlockers = blockers.length > 0;
  const orderedIds = new Set(ordered.map((s) => s.id));

  const steps: ProvisioningStepState[] = ordered.map((s) => {
    const deps = (s.dependsOn ?? []).filter((depId) => orderedIds.has(depId));
    const status = hasBlockers ? "blocked" : deps.length === 0 ? "ready" : "pending";
    return {
      stepId: s.id,
      status,
      blockers: [],
      warnings: [],
      attempts: 0,
    };
  });

  const now = new Date().toISOString();
  const fingerprint = calculateProvisioningFingerprint({
    tenantId: tenant.id,
    tenantSlug: tenant.clientSlug,
    plan: manifest.plan,
    target: manifest.target,
    domain: manifest.client.domain,
    enabledModules: manifest.enabledModules,
    appName: tenant.branding.appName,
  });

  return {
    id: crypto.randomUUID(),
    tenantId: tenant.id,
    tenantSlug: tenant.clientSlug,
    plan: manifest.plan,
    target: manifest.target,
    manifestFingerprint: fingerprint,
    status: hasBlockers ? "blocked" : "ready",
    steps,
    blockers,
    warnings,
    createdAt: now,
    updatedAt: now,
  };
}
