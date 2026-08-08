/**
 * Barrel da Brighter Marketplace / Module Licensing Foundation — v1.
 *
 * Consome (nunca duplica) `MODULE_CATALOG` do Module Engine
 * (`lib/modules/catalog.ts`), `resolveBillingEntitlements` do Billing
 * Engine, `Installation` da Control Plane e `MonitoringSnapshot` do
 * Monitoring Engine. Sem ativação real, sem cobrança real, sem
 * provisionamento real, sem persistência real — ver cabeçalho de cada
 * submódulo.
 *
 * Importa `sanitizeDeep` de `@/lib/tenants/export` diretamente (nunca o
 * barrel `@/lib/tenants`, que dispara leitura de `process.env` via
 * `current-installation.ts` — mesmo cuidado documentado em
 * `lib/billing/index.ts`/`lib/outreach/index.ts`).
 */
export * from "./types";
export * from "./status";
export * from "./catalog";
export * from "./offers";
export * from "./bundles";
export * from "./licenses";
export * from "./trials";
export * from "./eligibility";
export * from "./entitlements";
export * from "./activation";
export * from "./versioning";
export * from "./validation";
export * from "./history";
export * from "./repository";
export * from "./adapters";
export * from "./integrations";
export * from "./simulation";
export * from "./sanitization";
export * from "./summary";
