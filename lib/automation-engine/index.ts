/**
 * Barrel do Brighter Automation Engine — Foundation v1.
 *
 * Consome (nunca duplica) `Installation` da Control Plane
 * (`lib/control-plane/`) e `MODULE_CATALOG` do Module Engine
 * (`lib/modules/catalog.ts`). Sem execução real de ação, sem agendamento
 * real, sem persistência real — ver cabeçalho de cada submódulo.
 *
 * Distinto do motor legado do CRM (`lib/automation/` — execução real,
 * por-organização, disparada por `event_log`): este barrel NUNCA importa
 * nem é importado por `lib/automation/*`. Ver header de `types.ts` §"Dois
 * sistemas chamados automação".
 *
 * Importa `sanitizeDeep` de `@/lib/tenants/export` diretamente (nunca o
 * barrel `@/lib/tenants`, que dispara leitura de `process.env` via
 * `current-installation.ts` — mesmo cuidado documentado em
 * `lib/monitoring/index.ts`/`lib/billing/index.ts`).
 */
export * from "./types";
export * from "./catalog";
export * from "./validation";
export * from "./planner";
export * from "./history";
export * from "./executor";
export * from "./sanitization";
export * from "./repository";
export * from "./summary";
export * from "./simulation";
