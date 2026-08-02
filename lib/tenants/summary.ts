/**
 * Resumos de leitura do Tenant Engine — funções puras que combinam
 * `Tenant` + `TenantReadiness` (já calculada por `evaluateTenantReadiness`,
 * nunca recalculada aqui) em objetos prontos pra tela/CLI. Sem segredo, sem
 * I/O, sem string mágica.
 */
import type {
  DeploymentInfrastructure,
  DeploymentPlan,
  DeploymentTarget,
  RejectedModule,
} from "@/lib/deployment";

import type {
  Tenant,
  TenantCommercialStatus,
  TenantContact,
  TenantInfrastructureReference,
  TenantReadiness,
  TenantSupabaseReference,
  TenantTechnicalStatus,
} from "./types";

export type TenantTechnicalSummary = {
  plan: DeploymentPlan;
  target: DeploymentTarget | undefined;
  domain: string;
  enabledModules: string[];
  rejectedModules: RejectedModule[];
  infrastructure: DeploymentInfrastructure | null;
  infrastructureReference: TenantInfrastructureReference | null;
  supabase: TenantSupabaseReference | null;
  manifestValid: boolean;
  readinessScore: number;
  technicalStatus: TenantTechnicalStatus;
};

export function summarizeTenantTechnical(tenant: Tenant, readiness: TenantReadiness): TenantTechnicalSummary {
  return {
    plan: tenant.plan,
    target: tenant.infrastructure?.target ?? tenant.manifest?.target,
    domain: tenant.domain,
    enabledModules: tenant.enabledModules,
    rejectedModules: tenant.manifest?.rejectedModules ?? [],
    infrastructure: tenant.manifest?.infrastructure ?? null,
    infrastructureReference: tenant.infrastructure ?? null,
    supabase: tenant.supabase ?? null,
    manifestValid: Boolean(tenant.manifest?.valid),
    readinessScore: readiness.score,
    technicalStatus: tenant.technicalStatus,
  };
}

export type TenantCommercialSummary = {
  clientName: string;
  clientSlug: string;
  commercialStatus: TenantCommercialStatus;
  primaryContact: TenantContact | null;
  accountManager: TenantContact | null;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
  readinessScore: number;
};

export function summarizeTenantCommercial(tenant: Tenant, readiness: TenantReadiness): TenantCommercialSummary {
  return {
    clientName: tenant.clientName,
    clientSlug: tenant.clientSlug,
    commercialStatus: tenant.commercialStatus,
    primaryContact: tenant.primaryContact ?? null,
    accountManager: tenant.accountManager ?? null,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    notes: tenant.notes ?? null,
    readinessScore: readiness.score,
  };
}
