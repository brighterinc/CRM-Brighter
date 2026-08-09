/**
 * Brighter Provisioning Adapters Engine — Foundation v1. Ver
 * docs/provisioning-adapters/overview.md.
 *
 * Traduz uma etapa ABSTRATA do Provisioning Engine (`lib/provisioning/`)
 * pra um provider concreto (Supabase, Vercel, DNS, VPS, Docker, Reverse
 * Proxy, Redis, Email, WhatsApp, Chatwoot, Evolution, WAHA, Noop, Fake) —
 * só como contrato tipado, blueprint e simulador determinístico. NÃO cria
 * VPS, Supabase, Vercel, banco, domínio, Redis, Docker, Evolution, WAHA ou
 * Chatwoot de verdade; NÃO altera `.env`/DNS/Caddy reais; NÃO faz deploy.
 * Nenhum arquivo aqui lê `process.env` — seguro importar este barrel de
 * qualquer lugar, inclusive CLI.
 */
export * from "./types";
export * from "./status";
export * from "./capabilities";
export * from "./catalog";
export * from "./validation";
export * from "./sanitization";
export * from "./registry";
export * from "./mapper";
export * from "./executor";
export * from "./rollback";
export * from "./repository";
export * from "./simulation";
export * from "./summary";
export * from "./integrations";
export * from "./providers";
