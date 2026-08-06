/**
 * Barrel da Brighter Outreach & AI Cadence Engine — Foundation v1.
 *
 * Consome (nunca duplica) `Installation` da Control Plane
 * (`lib/control-plane/`), `MODULE_CATALOG` do Module Engine
 * (`lib/modules/catalog.ts`), `resolveBillingEntitlements` do Billing
 * Engine e `MonitoringSnapshot` do Monitoring Engine. Sem envio real, sem
 * IA real, sem agendamento real, sem persistência real — ver cabeçalho de
 * cada submódulo.
 *
 * Distinto do motor de follow-up real do CRM (`lib/followup/` — execução
 * real, DB-backed, disparada por `event_log`) e do Automation Engine
 * genérico (`lib/automation-engine/` — orquestração genérica de gatilho/
 * ação): este barrel NUNCA importa nem é importado por `lib/followup/*` ou
 * `lib/automation/*`. Ver header de `types.ts`.
 *
 * Importa `sanitizeDeep` de `@/lib/tenants/export` diretamente (nunca o
 * barrel `@/lib/tenants`, que dispara leitura de `process.env` via
 * `current-installation.ts` — mesmo cuidado documentado em
 * `lib/monitoring/index.ts`/`lib/billing/index.ts`/`lib/automation-engine/index.ts`).
 */
export * from "./types";
export * from "./status";
export * from "./catalog";
export * from "./validation";
export * from "./segments";
export * from "./audiences";
export * from "./campaigns";
export * from "./cadences";
export * from "./enrollments";
export * from "./templates";
export * from "./personalization";
export * from "./scheduling";
export * from "./throttling";
export * from "./adapters";
export * from "./responses";
export * from "./handoff";
export * from "./consent";
export * from "./metrics";
export * from "./repository";
export * from "./integrations";
export * from "./simulation";
export * from "./sanitization";
export * from "./summary";
