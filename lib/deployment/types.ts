/**
 * Tipos centrais do Brighter Deployment Engine — Foundation v1.
 *
 * Este módulo NUNCA provisiona nada (sem VPS, Supabase, Vercel, DNS, Docker).
 * Transforma uma configuração comercial de cliente (`DeploymentRequest`) num
 * manifesto técnico validado e legível (`DeploymentManifest`) — ver
 * `lib/deployment/manifest.ts`. Reusa o catálogo/resolvedor de
 * `lib/modules/` para decidir quais módulos ligam; não duplica essa regra.
 */
import type { DeploymentPlan, ModuleInfraRequirements } from "@/lib/modules/catalog";

export type { DeploymentPlan };

/** Onde o frontend hospedado roda. VPS só existe (e é obrigatória) no Dedicated. */
export type DeploymentTarget = "vercel" | "cloudflare" | "vps";

/** Campos de marca white-label do cliente — mesmo shape de `lib/branding.ts`, como input cru. */
export type ClientBrandingInput = {
  appName: string;
  legalName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  supportEmail?: string;
  websiteUrl?: string;
  fromName?: string;
  fromEmail?: string;
};

/** Configuração comercial recebida (formulário interno, script de onboarding, etc). */
export type DeploymentRequest = {
  clientName: string;
  clientSlug: string;
  domain: string;
  plan: DeploymentPlan;
  requestedModules: string[];
  /**
   * Módulos a desligar explicitamente mesmo que ligariam por default — espelha
   * `DISABLED_MODULES` do Module Engine (precedência máxima na resolução).
   * Opcional: a maioria dos pedidos comerciais só liga módulos.
   */
  disabledModules?: string[];
  branding: ClientBrandingInput;
  /** Se ausente, cai no `defaultTarget` do perfil do plano. */
  target?: DeploymentTarget;
};

/** Módulo pedido que não pôde ser ligado, e o porquê (linguagem de operador, não código). */
export type RejectedModule = {
  moduleId: string;
  reason: string;
};

/** Item de checklist da instalação — agrupado por categoria na tela/CLI. */
export type ChecklistItem = {
  id: string;
  label: string;
  category: string;
  required: boolean;
};

/**
 * Nomes de variáveis de ambiente exigidos pela combinação plano+módulos —
 * NUNCA valores. `generatedPublicValues` só contém dado já público (branding,
 * plano, lista de módulos) que pode virar `NEXT_PUBLIC_*`/env de build; nunca
 * segredo.
 */
export type DeploymentEnvironment = {
  required: string[];
  optional: string[];
  generatedPublicValues: Record<string, string>;
};

/** Infra agregada a partir dos `requires` dos módulos habilitados + regras do plano. */
export type DeploymentInfrastructure = ModuleInfraRequirements & {
  vpsRequired: boolean;
  docker: boolean;
  proxy: boolean;
};

export type DeploymentManifest = {
  client: {
    name: string;
    slug: string;
    domain: string;
  };
  plan: DeploymentPlan;
  target: DeploymentTarget;
  requestedModules: string[];
  enabledModules: string[];
  rejectedModules: RejectedModule[];
  infrastructure: DeploymentInfrastructure;
  environment: DeploymentEnvironment;
  warnings: string[];
  blockers: string[];
  checklist: ChecklistItem[];
  /** `true` quando `blockers` está vazio — atalho pra quem só quer saber se pode prosseguir. */
  valid: boolean;
};
