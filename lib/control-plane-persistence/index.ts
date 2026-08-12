/**
 * Brighter Control Plane Persistence + Credentials Vault.
 *
 * Dá persistência REAL (Supabase, tabelas `control_plane_*`, migration
 * `0098_control_plane_persistence`) às fundações Foundation v1 que só
 * existiam in-memory (`lib/tenants`, `lib/control-plane`, `lib/deployment`,
 * `lib/provisioning`, `lib/provisioning-adapters`) — nunca as reimplementa.
 * Ainda NÃO conecta nenhum provider real (Supabase/Vercel/DNS/VPS/WhatsApp/
 * etc) — isso é fase futura, ver `docs/control-plane-persistence/runtime-boundary.md`.
 *
 * Ver `docs/control-plane-persistence/overview.md` pro mapa completo.
 */
export * from "./types";
export * from "./safe-persistence";
export * from "./mappers";
export * from "./vault";
export * from "./repositories";
export * from "./services";
