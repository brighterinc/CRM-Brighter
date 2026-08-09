/**
 * Vocabulário de status da Provisioning Adapters Foundation — listas
 * fechadas + type guards. Mesmo padrão de `lib/control-plane/status.ts`.
 */
import type { ProvisioningAdapterResultStatus, ProvisioningAdapterStatus } from "./types";

export const PROVISIONING_ADAPTER_STATUSES: ProvisioningAdapterStatus[] = [
  "available",
  "unavailable",
  "planned",
  "disabled",
];

export const PROVISIONING_ADAPTER_RESULT_STATUSES: ProvisioningAdapterResultStatus[] = [
  "simulated",
  "ready",
  "blocked",
  "failed",
  "skipped",
];

export function isProvisioningAdapterStatus(value: string): value is ProvisioningAdapterStatus {
  return (PROVISIONING_ADAPTER_STATUSES as string[]).includes(value);
}

export function isProvisioningAdapterResultStatus(value: string): value is ProvisioningAdapterResultStatus {
  return (PROVISIONING_ADAPTER_RESULT_STATUSES as string[]).includes(value);
}

/** Resultados que representam prontidão real de execução dry-run (nunca execução de verdade). */
export const READY_ADAPTER_RESULT_STATUSES: ProvisioningAdapterResultStatus[] = ["simulated", "ready"];

/** Resultados que impedem etapas dependentes de prosseguir no dry-run agregado. */
export const HALTING_ADAPTER_RESULT_STATUSES: ProvisioningAdapterResultStatus[] = ["blocked", "failed"];
