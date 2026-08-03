/**
 * Barrel do Brighter Monitoring Engine — Foundation v1.
 *
 * Consome (nunca duplica) `Installation` da Control Plane
 * (`lib/control-plane/`), que já é `Tenant` + `DeploymentManifest` +
 * `ProvisioningSummary` + branding + módulos. Sem check real, sem rede, sem
 * persistência real — ver cabeçalho de cada submódulo.
 *
 * Importa `sanitizeDeep` de `@/lib/tenants/export` diretamente (nunca o
 * barrel `@/lib/tenants`, que dispara leitura de `process.env` via
 * `current-installation.ts` — mesmo cuidado documentado em
 * `lib/control-plane/repository.ts`).
 */
export * from "./types";
export * from "./status";
export * from "./catalog";
export * from "./validation";
export * from "./evaluator";
export * from "./incidents";
export * from "./sanitization";
export * from "./summary";
export * from "./repository";
export * from "./adapters";
