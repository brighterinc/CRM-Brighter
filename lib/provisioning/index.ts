/**
 * Brighter Provisioning Engine — Foundation v1. Ver
 * docs/provisioning/provisioning-engine.md.
 *
 * Transforma `Tenant` + `DeploymentManifest` num plano de execução ordenado
 * (etapas, dependências, status, blockers, dry-run, rollback teórico, logs
 * sanitizados). NÃO provisiona VPS, Supabase, Vercel, DNS ou containers —
 * nesta Foundation só existem adaptadores fake/noop. Nenhum arquivo aqui lê
 * `process.env` — diferente do barrel de `lib/tenants`, é seguro importar
 * este barrel de qualquer lugar, inclusive de CLI.
 */
export * from "./types";
export * from "./catalog";
export * from "./validation";
export * from "./planner";
export * from "./executor";
export * from "./rollback";
export * from "./logging";
export * from "./summary";
