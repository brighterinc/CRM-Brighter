/**
 * Resolução pura do Module Engine — sem `process.env`, sem `next/navigation`.
 *
 * Testável isolado: toda função recebe seus inputs explicitamente (nada de
 * singleton aqui). `lib/modules/runtime.ts` é quem lê `process.env` (via
 * `lib/env.ts`) uma vez e chama estas funções.
 *
 * Precedência de resolução por módulo (nessa ordem):
 *   1. DISABLED_MODULES         → sempre desligado.
 *   2. fora de allowedPlans     → nunca liga, mesmo listado em ENABLED_MODULES.
 *   3. dependência desligada    → desliga em cascata (fixed-point).
 *   4. ENABLED_MODULES          → liga.
 *   5. defaultEnabled           → liga.
 *   caso contrário              → desligado ("não habilitado por padrão").
 */
import {
  MODULE_CATALOG,
  DEPLOYMENT_PLANS,
  type DeploymentPlan,
  type ModuleDefinition,
  type ModuleUnavailableReason,
} from "./catalog";

export type ModuleAvailability = {
  module: ModuleDefinition;
  enabled: boolean;
  reason: ModuleUnavailableReason | null;
  /** Presente só quando reason === "dependency_disabled". */
  blockedDependency?: string;
};

const DEFAULT_PLAN: DeploymentPlan = "dedicated";

/**
 * Ausente ou inválido → "dedicated" (o plano mais permissivo, e o único que
 * existia antes do Module Engine — preserva o comportamento de instalações
 * antigas sem `DEPLOYMENT_PLAN` setado).
 */
export function resolveDeploymentPlan(raw: string | undefined | null): DeploymentPlan {
  const value = (raw ?? "").trim().toLowerCase();
  if ((DEPLOYMENT_PLANS as string[]).includes(value)) {
    return value as DeploymentPlan;
  }
  return DEFAULT_PLAN;
}

/** "a, b,,c " → ["a", "b", "c"]. String vazia/ausente → []. */
export function parseModuleIdList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export interface ResolveModuleAvailabilityInput {
  plan: DeploymentPlan;
  enabledRaw?: string | undefined | null;
  disabledRaw?: string | undefined | null;
  catalog?: ModuleDefinition[];
}

export function resolveModuleAvailability({
  plan,
  enabledRaw,
  disabledRaw,
  catalog = MODULE_CATALOG,
}: ResolveModuleAvailabilityInput): ModuleAvailability[] {
  const enabledSet = new Set(parseModuleIdList(enabledRaw));
  const disabledSet = new Set(parseModuleIdList(disabledRaw));

  const state = new Map<string, ModuleAvailability>();

  for (const mod of catalog) {
    if (disabledSet.has(mod.id)) {
      state.set(mod.id, { module: mod, enabled: false, reason: "explicitly_disabled" });
      continue;
    }
    if (!mod.allowedPlans.includes(plan)) {
      state.set(mod.id, { module: mod, enabled: false, reason: "plan_not_allowed" });
      continue;
    }
    if (enabledSet.has(mod.id) || mod.defaultEnabled) {
      state.set(mod.id, { module: mod, enabled: true, reason: null });
      continue;
    }
    state.set(mod.id, { module: mod, enabled: false, reason: "not_enabled_by_default" });
  }

  // Cascata de dependência — fixed point (chains como ai.agents → ai.memory →
  // ai.rag precisam de mais de uma passada pra propagar até o fim).
  let changed = true;
  let guard = 0;
  while (changed && guard < catalog.length + 1) {
    changed = false;
    guard += 1;
    for (const mod of catalog) {
      const current = state.get(mod.id);
      if (!current?.enabled || !mod.dependsOn?.length) continue;
      const blockedDep = mod.dependsOn.find((depId) => state.get(depId)?.enabled === false);
      if (blockedDep) {
        state.set(mod.id, {
          module: mod,
          enabled: false,
          reason: "dependency_disabled",
          blockedDependency: blockedDep,
        });
        changed = true;
      }
    }
  }

  return catalog.map((mod) => state.get(mod.id)!);
}
