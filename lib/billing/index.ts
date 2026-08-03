/**
 * Barrel do Brighter Billing Engine — Foundation v1.
 *
 * Consome (nunca duplica) `Installation` da Control Plane
 * (`lib/control-plane/`), `DeploymentPlan` do Deployment Engine e
 * `MODULE_CATALOG` do Module Engine. Sem cobrança real, sem gateway, sem
 * persistência real — ver cabeçalho de cada submódulo.
 *
 * Importa `sanitizeDeep` de `@/lib/tenants/export` diretamente (nunca o
 * barrel `@/lib/tenants`, que dispara leitura de `process.env` via
 * `current-installation.ts` — mesmo cuidado documentado em
 * `lib/monitoring/index.ts`/`lib/control-plane/repository.ts`).
 */
export * from "./types";
export * from "./status";
export * from "./catalog";
export * from "./pricing";
export * from "./validation";
export * from "./subscriptions";
export * from "./usage";
export * from "./entitlements";
export * from "./invoices";
export * from "./events";
export * from "./sanitization";
export * from "./adapters";
export * from "./repository";
export * from "./summary";
export * from "./simulation";
