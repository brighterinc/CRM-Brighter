/**
 * Vocabulário de status da Control Plane — listas fechadas + type guards.
 * Mesmo padrão de `lib/tenants/status.ts`. Metadados legíveis (label,
 * descrição, categoria) ficam em `catalog.ts` — este arquivo só tem o
 * vocabulário cru e agrupamentos derivados dele.
 */
import type { CommercialStatus, InstallationStatus, TechnicalStatus } from "./types";

export const INSTALLATION_STATUSES: InstallationStatus[] = [
  "planned",
  "provisioning",
  "deploying",
  "waiting_dns",
  "waiting_ssl",
  "waiting_customer",
  "active",
  "maintenance",
  "paused",
  "archived",
  "error",
];

export const COMMERCIAL_STATUSES: CommercialStatus[] = [
  "lead",
  "proposal",
  "contract",
  "payment_pending",
  "implementation",
  "production",
  "cancelled",
];

export const TECHNICAL_STATUSES: TechnicalStatus[] = [
  "draft",
  "validated",
  "ready",
  "deploying",
  "running",
  "warning",
  "failed",
];

export function isInstallationStatus(value: string): value is InstallationStatus {
  return (INSTALLATION_STATUSES as string[]).includes(value);
}

export function isCommercialStatus(value: string): value is CommercialStatus {
  return (COMMERCIAL_STATUSES as string[]).includes(value);
}

export function isTechnicalStatus(value: string): value is TechnicalStatus {
  return (TECHNICAL_STATUSES as string[]).includes(value);
}

/**
 * Status que representam a instalação esperando uma ação externa (DNS, SSL
 * ou o próprio cliente) — usado pelo `summary.ts` para os contadores
 * "aguardando DNS/SSL/cliente" e pela tela admin pros badges de atenção.
 */
export const WAITING_INSTALLATION_STATUSES: InstallationStatus[] = ["waiting_dns", "waiting_ssl", "waiting_customer"];

/** Status terminais — a instalação não avança mais sozinha a partir daqui. */
export const TERMINAL_INSTALLATION_STATUSES: InstallationStatus[] = ["archived", "error"];

/**
 * Rank comercial — só existe pro critério "negócio fechado" (rank ≥
 * `contract`). `cancelled` fica em 0 (nunca conta como fechado, mesmo tendo
 * passado por `contract` no passado). Mesmo padrão de
 * `COMMERCIAL_STATUS_RANK` em `lib/tenants/status.ts`.
 */
export const COMMERCIAL_STATUS_RANK: Record<CommercialStatus, number> = {
  lead: 1,
  proposal: 2,
  contract: 3,
  payment_pending: 4,
  implementation: 5,
  production: 6,
  cancelled: 0,
};

/**
 * Rank técnico — ordem de progresso natural. `warning`/`failed` não têm
 * "posição" no progresso (podem acontecer em qualquer estágio rodando), por
 * isso ficam fora da escada 0–4 e nunca comparáveis por `>=` contra os
 * demais.
 */
export const TECHNICAL_STATUS_RANK: Record<TechnicalStatus, number> = {
  draft: 0,
  validated: 1,
  ready: 2,
  deploying: 3,
  running: 4,
  warning: -1,
  failed: -1,
};
