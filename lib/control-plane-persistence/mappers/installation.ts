/**
 * Mapper `control_plane_installations` <-> `Installation` (`lib/control-plane/types.ts`).
 *
 * A linha da tabela guarda só os campos que a `Installation` tem de VERDADE
 * (id, tenant, slug, company, status/commercial/technical PRÓPRIOS da
 * Control Plane). `deployment`/`branding`/`modules`/`deploymentPlan`/
 * `provisioning` nunca são coluna — são sempre derivados do `tenant` (já com
 * manifesto anexado) via `deriveInstallationFromTenant`, a MESMA função que
 * `InMemoryInstallationRepository` usa (`lib/control-plane/repository.ts`,
 * exportada de lá por este motivo). Persistir esses campos como coluna
 * duplicaria uma fonte de verdade que já existe no tenant.
 */
import { deriveInstallationFromTenant } from "@/lib/control-plane/repository";
import type { CommercialStatus, Installation, InstallationStatus, TechnicalStatus } from "@/lib/control-plane/types";
import type { Tenant } from "@/lib/tenants/types";

export type ControlPlaneInstallationRow = {
  id: string;
  tenant_id: string;
  slug: string;
  company: string;
  status: string;
  commercial: string;
  technical: string;
  created_at: string;
  updated_at: string;
};

/** `tenant` precisa já ter `manifest` anexado — mesma pré-condição de `deriveInstallationFromTenant`. */
export function installationRowToDomain(row: ControlPlaneInstallationRow, tenant: Tenant): Installation {
  const derived = deriveInstallationFromTenant(tenant);
  return {
    id: row.id,
    slug: row.slug,
    company: row.company,
    status: row.status as InstallationStatus,
    commercial: row.commercial as CommercialStatus,
    technical: row.technical as TechnicalStatus,
    tenant,
    ...derived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ControlPlaneInstallationInsertRow = {
  tenant_id: string;
  slug: string;
  company: string;
  status: string;
  commercial: string;
  technical: string;
};

export function installationDomainToInsertRow(input: {
  tenantId: string;
  slug: string;
  company: string;
  status: InstallationStatus;
  commercial: CommercialStatus;
  technical: TechnicalStatus;
}): ControlPlaneInstallationInsertRow {
  return {
    tenant_id: input.tenantId,
    slug: input.slug,
    company: input.company,
    status: input.status,
    commercial: input.commercial,
    technical: input.technical,
  };
}
