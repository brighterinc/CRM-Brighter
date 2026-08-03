/**
 * Validação pura do Brighter Provisioning Engine. Cada função devolve
 * mensagens de erro (`string[]`) — nunca lança. Reusa (não reimplementa)
 * `attachDeploymentManifest` e `evaluateTenantReadiness` do Tenant Engine.
 */
import { evaluateTenantReadiness } from "@/lib/tenants/readiness";
import { attachDeploymentManifest } from "@/lib/tenants/validation";
import type { Tenant } from "@/lib/tenants/types";

import { PROVISIONING_STEP_CATALOG } from "./catalog";
import type { DeploymentManifest, ProvisioningStepDefinition } from "./types";

/**
 * Confere que o manifesto foi de fato gerado PRA ESTE tenant — reusa
 * `attachDeploymentManifest` só para LER o resultado (nunca aplica o
 * `tenant` retornado; esta função não muta nada). Divergência de
 * slug/domínio/plano/módulos/branding vira blocker.
 */
export function validateTenantManifestCompatibility(tenant: Tenant, manifest: DeploymentManifest): string[] {
  const result = attachDeploymentManifest(tenant, manifest);
  if (result.ok) return [];
  return result.errors.map((e) => `incompatibilidade tenant×manifesto (${e.field}): ${e.message}`);
}

/**
 * Reusa `evaluateTenantReadiness` — nunca recalcula os critérios de
 * prontidão do Tenant Engine. Blockers de readiness viram blockers de
 * provisionamento (não dá pra montar um plano de execução pra um tenant que
 * ainda não está pronto); warnings seguem como warnings.
 */
export function validateTenantReadinessForProvisioning(tenant: Tenant): {
  blockers: string[];
  warnings: string[];
} {
  const readiness = evaluateTenantReadiness(tenant);
  return {
    blockers: readiness.blockers.map((b) => `prontidão do tenant pendente (${b.category}): ${b.label}`),
    warnings: readiness.warnings.map((w) => `aviso de prontidão do tenant (${w.category}): ${w.label}`),
  };
}

/**
 * DFS com pilha de recursão — devolve o primeiro ciclo encontrado (lista de
 * ids, do início ao fechamento do ciclo) ou `null`. Recebe `catalog` como
 * parâmetro (default `PROVISIONING_STEP_CATALOG`) para permitir teste
 * determinístico com um catálogo minúsculo malformado — o catálogo real
 * nunca deveria ter ciclo.
 */
export function detectCircularStepDependencies(
  catalog: ProvisioningStepDefinition[] = PROVISIONING_STEP_CATALOG,
): string[] | null {
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const stack: string[] = [];
  const stackSet = new Set<string>();

  function visit(id: string): string[] | null {
    if (stackSet.has(id)) {
      const cycleStart = stack.indexOf(id);
      return [...stack.slice(cycleStart), id];
    }
    if (visited.has(id)) return null;

    visited.add(id);
    stack.push(id);
    stackSet.add(id);

    const def = byId.get(id);
    for (const depId of def?.dependsOn ?? []) {
      if (!byId.has(depId)) continue;
      const cycle = visit(depId);
      if (cycle) return cycle;
    }

    stack.pop();
    stackSet.delete(id);
    return null;
  }

  for (const s of catalog) {
    const cycle = visit(s.id);
    if (cycle) return cycle;
  }
  return null;
}

/** Sanidade do catálogo: todo `dependsOn` aponta pra id existente, sem id duplicado. */
export function validateStepCatalog(
  catalog: ProvisioningStepDefinition[] = PROVISIONING_STEP_CATALOG,
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const ids = new Set(catalog.map((s) => s.id));

  for (const s of catalog) {
    if (seen.has(s.id)) {
      errors.push(`etapa duplicada no catálogo: "${s.id}"`);
    }
    seen.add(s.id);

    for (const depId of s.dependsOn ?? []) {
      if (!ids.has(depId)) {
        errors.push(`etapa "${s.id}" depende de "${depId}", que não existe no catálogo`);
      }
    }
  }

  return errors;
}
