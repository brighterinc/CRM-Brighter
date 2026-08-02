/**
 * Tipos centrais do Brighter Tenant Engine — Foundation v1.
 *
 * Um `Tenant` representa UMA instalação White Label independente (1 cliente
 * → 1 Supabase → 1 domínio → 1 deploy), NUNCA uma linha de multi-tenant
 * compartilhado — isso já existe dentro de cada instalação via
 * `organizations`/RLS (ver `lib/auth/types.ts`) e é outra coisa. Ver
 * `docs/tenants/tenant-lifecycle.md` para a distinção completa.
 *
 * Este módulo NUNCA guarda segredo — nem service_role key, nem senha de
 * banco, nem connection string, nem token, nem chave SSH. Só nomes de
 * recurso, IDs externos, URLs públicas e metadados. Ver `lib/tenants/export.ts`
 * para a sanitização recursiva que defende isso mesmo contra objeto "sujo"
 * em runtime.
 *
 * Reusa (não redefine) os tipos do Deployment Engine — `DeploymentPlan`,
 * `DeploymentTarget`, `ClientBrandingInput`, `DeploymentManifest` — porque
 * o manifesto de implantação de um tenant é gerado por
 * `generateDeploymentManifest()`, nunca reimplementado aqui.
 */
import type {
  ClientBrandingInput,
  DeploymentManifest,
  DeploymentPlan,
  DeploymentTarget,
} from "@/lib/deployment";

export type TenantCommercialStatus =
  | "lead"
  | "proposal"
  | "contracted"
  | "onboarding"
  | "active"
  | "suspended"
  | "cancelled";

export type TenantTechnicalStatus =
  | "draft"
  | "configuration_pending"
  | "ready_to_provision"
  | "provisioning"
  | "validation"
  | "live"
  | "degraded"
  | "archived";

export type TenantContact = {
  name: string;
  email: string;
  phone?: string;
  role?: string;
};

/** Ponteiro pra infra pública do tenant — nunca credencial. */
export type TenantInfrastructureReference = {
  target: DeploymentTarget;
  provider?: string;
  projectReference?: string;
  region?: string;
  externalId?: string;
};

/** Ponteiro público do projeto Supabase do tenant — nunca chave/connection string. */
export type TenantSupabaseReference = {
  projectRef?: string;
  projectUrl?: string;
  region?: string;
};

export type Tenant = {
  id: string;
  clientName: string;
  clientSlug: string;
  legalName?: string;
  domain: string;
  plan: DeploymentPlan;
  requestedModules: string[];
  enabledModules: string[];
  branding: ClientBrandingInput;
  commercialStatus: TenantCommercialStatus;
  technicalStatus: TenantTechnicalStatus;
  primaryContact?: TenantContact;
  accountManager?: TenantContact;
  infrastructure?: TenantInfrastructureReference;
  supabase?: TenantSupabaseReference;
  manifest?: DeploymentManifest;
  notes?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
};

/** Erro estruturado — nunca mensagem genérica solta. `field` usa dot-path (ex.: `primaryContact.email`). */
export type TenantValidationError = { field: string; message: string };

export type TenantReadinessItem = { id: string; label: string; category: string };

export type TenantReadiness = {
  /** `true` quando `blockers.length === 0`. */
  ready: boolean;
  /** 0–100, determinístico — soma dos pesos dos itens blocker satisfeitos. Nunca esconde blocker. */
  score: number;
  blockers: TenantReadinessItem[];
  warnings: TenantReadinessItem[];
  completed: TenantReadinessItem[];
};
