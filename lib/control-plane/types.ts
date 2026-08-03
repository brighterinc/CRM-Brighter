/**
 * Tipos centrais do Brighter Control Plane — Foundation v1.
 *
 * Este módulo NUNCA persiste nada de verdade, NUNCA provisiona, NUNCA faz
 * deploy, NUNCA cria Docker/VPS/Supabase/DNS e NUNCA acessa a Lumina. É a
 * camada que CONHECE todas as instalações White Label da Brighter — pense
 * "Supabase Dashboard"/"Vercel Dashboard": ela não é a infraestrutura, é
 * quem sabe o estado de cada uma.
 *
 * `Installation` é deliberadamente um AGREGADO — nunca reimplementa o que as
 * cinco fundações anteriores já resolvem:
 * - `tenant: Tenant` (`lib/tenants/`) — identidade comercial, contatos, refs
 *   de infra/Supabase, `commercialStatus`/`technicalStatus` PRÓPRIOS do
 *   tenant (o que o CLIENTE está vivendo).
 * - `branding: ClientBrandingInput` (`lib/deployment/`) — sempre
 *   `tenant.branding`, nunca copiado a valor divergente.
 * - `modules: string[]` — sempre `tenant.enabledModules`, nunca a definição
 *   completa do módulo (que mora só no Module Engine).
 * - `deployment: DeploymentManifest` (`lib/deployment/`) — sempre
 *   `tenant.manifest`. `validateInstallationInput` (`./validation.ts`) FALHA
 *   se os dois divergirem — nunca uma cópia solta que pode dessincronizar.
 * - `provisioning: ProvisioningSummary` (`lib/provisioning/`) — sempre
 *   recalculado a partir do MESMO `tenant`+`manifest` via
 *   `generateProvisioningPlan`/`generateProvisioningSummary`, nunca guardado
 *   independente.
 *
 * O que a `Installation` adiciona de fato NOVO (não existe nas fundações
 * anteriores) é a visão de PLATAFORMA — `status`/`commercial`/`technical` —
 * que é a Brighter observando de FORA a instalação, uma granularidade
 * diferente do `commercialStatus`/`technicalStatus` que o próprio `Tenant`
 * já rastreia sobre si mesmo. Não é duplicação: são dois eixos diferentes
 * (o tenant sabe o que ELE está vivendo; a Control Plane sabe como a
 * BRIGHTER está operando aquela instalação — ex.: `waiting_dns`/
 * `waiting_ssl` são passos operacionais do time da Brighter, não algo que o
 * tenant relata sobre si mesmo). Por isso o vocabulário é deliberadamente
 * distinto (nunca os mesmos literais de `TenantCommercialStatus`/
 * `TenantTechnicalStatus`), embora ambos venham do mesmo domínio de negócio.
 */
import type { ClientBrandingInput, DeploymentManifest, DeploymentPlan } from "@/lib/deployment";
import type { ProvisioningSummary } from "@/lib/provisioning";
import type { Tenant } from "@/lib/tenants";

/**
 * Estado operacional da instalação do ponto de vista da Brighter — o "onde
 * está" no ciclo de vida de uma implantação White Label, do primeiro
 * planejamento até o arquivamento.
 */
export type InstallationStatus =
  | "planned"
  | "provisioning"
  | "deploying"
  | "waiting_dns"
  | "waiting_ssl"
  | "waiting_customer"
  | "active"
  | "maintenance"
  | "paused"
  | "archived"
  | "error";

/** Estágio comercial da relação com o cliente, do ponto de vista da Brighter. */
export type CommercialStatus =
  | "lead"
  | "proposal"
  | "contract"
  | "payment_pending"
  | "implementation"
  | "production"
  | "cancelled";

/** Estágio técnico da instalação, do ponto de vista da Brighter. */
export type TechnicalStatus = "draft" | "validated" | "ready" | "deploying" | "running" | "warning" | "failed";

/**
 * Uma instalação = 1 `Tenant` + 1 `DeploymentManifest` + 1 `ProvisioningSummary`
 * + branding + módulos — todos DERIVADOS do mesmo `tenant`, nunca inseridos
 * independentemente (ver `repository.ts`: `createInstallation` deriva,
 * nunca aceita `deployment`/`provisioning`/`branding`/`modules` como input
 * solto).
 */
export type Installation = {
  id: string;
  slug: string;
  company: string;
  status: InstallationStatus;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
  deploymentPlan: DeploymentPlan;
  tenant: Tenant;
  branding: ClientBrandingInput;
  modules: string[];
  deployment: DeploymentManifest;
  provisioning: ProvisioningSummary;
  commercial: CommercialStatus;
  technical: TechnicalStatus;
};

/** Erro estruturado — nunca mensagem genérica solta. `field` usa dot-path. */
export type InstallationValidationError = { field: string; message: string };

export type { ClientBrandingInput, DeploymentManifest, DeploymentPlan, ProvisioningSummary, Tenant };
