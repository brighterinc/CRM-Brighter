/**
 * Brighter Control Plane — Foundation v1. Ver docs/control-plane/control-plane.md.
 *
 * Camada que CONHECE todas as instalações White Label da Brighter — o
 * cérebro da plataforma (pense "Supabase Dashboard"/"Vercel Dashboard").
 * NÃO faz deploy, NÃO executa Docker, NÃO cria VPS/Supabase/DNS, NÃO acessa
 * a Lumina. Nesta Foundation v1: só domínio, sem persistência real (catálogo
 * in-memory de demonstração), sem API, sem migration.
 *
 * Consome (nunca duplica) as cinco fundações anteriores: `lib/branding`
 * (via `tenant.branding`), `lib/modules` (via `tenant.enabledModules`),
 * `lib/deployment` (`DeploymentManifest`/`DeploymentPlan`), `lib/tenants`
 * (`Tenant`, `validateTenantInput`, `attachDeploymentManifest`,
 * `createDemoTenants`) e `lib/provisioning` (`generateProvisioningPlan`/
 * `generateProvisioningSummary`). Nenhum arquivo aqui lê `process.env`.
 */
export * from "./types";
export * from "./status";
export * from "./catalog";
export * from "./validation";
export * from "./filters";
export * from "./summary";
export * from "./repository";
