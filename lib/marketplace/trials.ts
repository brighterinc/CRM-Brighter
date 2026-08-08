/**
 * Máquina de estados de `ModuleTrial` — Foundation v1. Datas SEMPRE recebidas
 * por parâmetro (nunca `Date.now()` interno) — quem chama controla o
 * relógio, mesmo padrão de `lib/automation-engine/executor.ts` (delay/retry
 * nunca usam `setTimeout` real). Nunca executa cobrança.
 */
import { isTrialTransitionValid, MarketplaceInvalidTransitionError } from "./status";
import type { MarketplaceModuleDefinition, ModuleTrial, TrialStatus } from "./types";

export type CreateTrialInput = {
  id: string;
  tenantId: string;
  installationId: string;
  moduleId: string;
  startsAt: string;
  durationDays: number;
};

export class TrialNotAvailableError extends Error {
  constructor(public readonly moduleId: string, public readonly reason: string) {
    super(`trial_not_available: ${moduleId} — ${reason}`);
    this.name = "TrialNotAvailableError";
  }
}

/** Recusa criar trial pra módulo sem `trialAvailable`, ou comercialmente `retired` — spec §8. */
export function createTrial(input: CreateTrialInput, marketplaceModule: MarketplaceModuleDefinition): ModuleTrial {
  if (!marketplaceModule.trialAvailable) {
    throw new TrialNotAvailableError(input.moduleId, `módulo "${input.moduleId}" não tem trial disponível`);
  }
  if (marketplaceModule.status === "retired") {
    throw new TrialNotAvailableError(input.moduleId, `módulo "${input.moduleId}" está retired — não aceita novo trial`);
  }

  const startsAtMs = new Date(input.startsAt).getTime();
  const endsAt = new Date(startsAtMs + input.durationDays * 24 * 60 * 60 * 1000).toISOString();

  return {
    id: input.id,
    tenantId: input.tenantId,
    installationId: input.installationId,
    moduleId: input.moduleId,
    status: "scheduled",
    startsAt: input.startsAt,
    endsAt,
    createdAt: input.startsAt,
    updatedAt: input.startsAt,
  };
}

function transition(trial: ModuleTrial, to: TrialStatus, patch: Partial<ModuleTrial>, now: string): ModuleTrial {
  if (!isTrialTransitionValid(trial.status, to)) {
    throw new MarketplaceInvalidTransitionError("trial", trial.status, to);
  }
  return { ...trial, ...patch, status: to, updatedAt: now };
}

export function startTrial(trial: ModuleTrial, now: string): ModuleTrial {
  return transition(trial, "active", {}, now);
}

/** Trial expirado NUNCA remove dado — só muda estado (mesma doutrina de licença suspensa). */
export function expireTrial(trial: ModuleTrial, now: string): ModuleTrial {
  return transition(trial, "expired", {}, now);
}

export function cancelTrial(trial: ModuleTrial, now: string): ModuleTrial {
  return transition(trial, "cancelled", {}, now);
}

/** Trial convertido não pode converter novamente — `TERMINAL_TRIAL_STATUSES` em `status.ts` já garante isso via a checagem de transição. */
export function convertTrial(trial: ModuleTrial, convertedLicenseId: string, now: string): ModuleTrial {
  return transition(trial, "converted", { convertedLicenseId }, now);
}

/** Único trial ATIVO/AGENDADO por tenant+módulo — política padrão do spec §8 ("salvo política explícita" futura). */
export function hasActiveTrial(trials: ModuleTrial[], tenantId: string, moduleId: string): boolean {
  return trials.some((t) => t.tenantId === tenantId && t.moduleId === moduleId && (t.status === "scheduled" || t.status === "active"));
}
