/**
 * Module Engine — camada central de runtime.
 *
 * Único lugar que lê `DEPLOYMENT_PLAN` / `ENABLED_MODULES` / `DISABLED_MODULES`
 * (via `lib/env.ts`) e resolve o catálogo (`lib/modules/resolver.ts`). Calculado
 * uma vez no import, mesmo padrão de `lib/env.ts` — as env vars não mudam
 * durante o processo. Nenhum outro módulo da aplicação deve ler essas 3 env
 * vars diretamente.
 *
 * Uso:
 *   import { isModuleEnabled, getEnabledModules } from "@/lib/modules/runtime";
 *
 * Pra proteger uma Server Component/rota, use `requireModule()` de
 * `lib/modules/guard.ts` (que usa este arquivo por baixo).
 */
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getModuleDefinition as lookupModuleDefinition, type ModuleDefinition } from "./catalog";
import {
  resolveDeploymentPlan,
  resolveModuleAvailability,
  type ModuleAvailability,
} from "./resolver";
import type { DeploymentPlan } from "./catalog";

export class ModuleDisabledError extends Error {
  constructor(public readonly moduleId: string) {
    super(`module_disabled: ${moduleId}`);
    this.name = "ModuleDisabledError";
  }
}

const plan: DeploymentPlan = resolveDeploymentPlan(env.DEPLOYMENT_PLAN);

const availability: ModuleAvailability[] = resolveModuleAvailability({
  plan,
  enabledRaw: env.ENABLED_MODULES,
  disabledRaw: env.DISABLED_MODULES,
});

// Desligar por dependência é uma decisão silenciosa de config — vira log
// estruturado pra quem opera a instalação não ficar sem explicação de por
// que um módulo que "devia" estar ligado não está.
for (const entry of availability) {
  if (entry.reason === "dependency_disabled") {
    logger.warn("[modules] módulo desligado: dependência desabilitada", {
      module_id: entry.module.id,
      blocked_dependency: entry.blockedDependency,
    });
  }
}

const availabilityById = new Map(availability.map((a) => [a.module.id, a] as const));

export function getDeploymentPlan(): DeploymentPlan {
  return plan;
}

/** Todo o catálogo, com o estado (ligado/desligado + motivo) desta instalação. */
export function getModuleAvailability(): ModuleAvailability[] {
  return availability;
}

export function getEnabledModules(): ModuleDefinition[] {
  return availability.filter((a) => a.enabled).map((a) => a.module);
}

/** Módulo fora do catálogo (id inválido) é tratado como desligado — fail-closed. */
export function isModuleEnabled(moduleId: string): boolean {
  return availabilityById.get(moduleId)?.enabled ?? false;
}

export function assertModuleEnabled(moduleId: string): void {
  if (!isModuleEnabled(moduleId)) {
    throw new ModuleDisabledError(moduleId);
  }
}

export function getModuleDefinition(moduleId: string): ModuleDefinition | undefined {
  return lookupModuleDefinition(moduleId);
}
