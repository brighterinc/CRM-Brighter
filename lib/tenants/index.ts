/**
 * Brighter Tenant Engine — Foundation v1. Ver docs/tenants/tenant-engine.md.
 *
 * Consolida um cliente White Label (identidade, plano, módulos, branding,
 * domínio, target, referências de infra/Supabase, status comercial/técnico)
 * SEM provisionar nada e SEM persistência real — só catálogo in-memory de
 * demonstração. Reusa o Module Engine e o Deployment Engine; nunca
 * reimplementa suas regras.
 */
export * from "./types";
export * from "./status";
export * from "./validation";
export * from "./readiness";
export * from "./summary";
export * from "./export";
export * from "./current-installation";
export * from "./repository";
