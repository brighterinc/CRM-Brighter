/**
 * Tipos centrais do Brighter Provisioning Engine — Foundation v1.
 *
 * Este módulo NUNCA provisiona nada (sem VPS, Supabase, Vercel, DNS, Docker,
 * systemd). Transforma um `Tenant` (`lib/tenants/`) + o `DeploymentManifest`
 * já anexado a ele (`lib/deployment/`) num plano de execução ORDENADO —
 * etapas, dependências, status, blockers — sem executar ação real. Reusa
 * (não redefine) `DeploymentPlan`/`DeploymentTarget`/`DeploymentManifest`/
 * `ModuleInfraRequirements`.
 *
 * `ProvisioningPlan` deliberadamente NÃO guarda o `DeploymentManifest`
 * inteiro (só `manifestFingerprint`) — o manifesto completo já vive em
 * `tenant.manifest`; duplicá-lo aqui divergiria cedo ou tarde (mesma
 * doutrina do Tenant Engine com `ClientBrandingInput`/`DeploymentManifest`).
 */
import type { DeploymentManifest, DeploymentPlan, DeploymentTarget } from "@/lib/deployment";
import type { ModuleInfraRequirements } from "@/lib/modules/catalog";

export type ProvisioningStepStatus =
  | "pending"
  | "ready"
  | "blocked"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "rolled_back";

export type ProvisioningRunStatus =
  | "draft"
  | "ready"
  | "blocked"
  | "running"
  | "completed"
  | "failed"
  | "rolling_back"
  | "rolled_back";

export type ProvisioningStepCategory =
  | "validation"
  | "branding"
  | "database"
  | "authentication"
  | "storage"
  | "application"
  | "domain"
  | "ssl"
  | "email"
  | "whatsapp"
  | "ai"
  | "monitoring"
  | "backup"
  | "handoff";

export type ProvisioningStepDefinition = {
  id: string;
  name: string;
  description: string;
  category: ProvisioningStepCategory;
  appliesToPlans: DeploymentPlan[];
  dependsOn?: string[];
  required: boolean;
  supportsRollback: boolean;
  /** Determinístico — calculado a partir do id, nunca de dado sensível. */
  idempotencyKey: string;
  /**
   * Flags de `ModuleInfraRequirements` exigidas no `DeploymentManifest` pra
   * esta etapa entrar no plano (ex.: `configure_whatsapp` só aparece se
   * `manifest.infrastructure.whatsapp === true`). Ausente/vazio = a etapa
   * entra sempre que `appliesToPlans` bater, sem checagem extra de infra.
   */
  requiresInfra?: Array<keyof ModuleInfraRequirements>;
};

export type ProvisioningStepState = {
  stepId: string;
  status: ProvisioningStepStatus;
  blockers: string[];
  warnings: string[];
  startedAt?: string;
  completedAt?: string;
  attempts: number;
};

export type ProvisioningPlan = {
  id: string;
  tenantId: string;
  tenantSlug: string;
  plan: DeploymentPlan;
  target: DeploymentTarget;
  manifestFingerprint: string;
  status: ProvisioningRunStatus;
  steps: ProvisioningStepState[];
  blockers: string[];
  warnings: string[];
  createdAt: string;
  updatedAt: string;
};

/** Nível de log estruturado — ver `lib/provisioning/logging.ts`. */
export type ProvisioningLogLevel = "info" | "warning" | "error" | "success";

export type ProvisioningLogEntry = {
  /** ISO-8601 UTC. */
  timestamp: string;
  runId: string;
  tenantId: string;
  stepId: string;
  level: ProvisioningLogLevel;
  event: string;
  message: string;
  /** Já passou por sanitização recursiva — nunca contém segredo. */
  metadata: Record<string, unknown>;
};

/** Resultado de uma execução (real ou simulada) de UMA etapa. */
export type ProvisioningStepResult = {
  stepId: string;
  status: ProvisioningStepStatus;
  message?: string;
  logs: ProvisioningLogEntry[];
};

/**
 * Contexto passado a um `ProvisioningAdapter` — deliberadamente NÃO inclui
 * `Tenant`/`DeploymentManifest` completos (o adapter não precisa, e não
 * deveria ter acesso a mais dado do que o necessário pra rodar uma etapa).
 */
export type ProvisioningExecutionContext = {
  runId: string;
  tenantId: string;
  tenantSlug: string;
  plan: DeploymentPlan;
  stepId: string;
};

/**
 * Adaptador abstrato de execução de etapa — nesta Foundation v1 só existem
 * implementações fake (`NoopProvisioningAdapter`, `InMemoryProvisioningAdapter`
 * em `lib/provisioning/executor.ts`). Adaptadores reais (Supabase/Vercel/
 * VPS/DNS/Caddy/WhatsApp/e-mail/IA) ficam pra uma fase futura.
 */
export type ProvisioningAdapter = {
  supports(stepId: string): boolean;
  execute(stepId: string, ctx: ProvisioningExecutionContext): Promise<ProvisioningStepResult>;
  rollback?(stepId: string, ctx: ProvisioningExecutionContext): Promise<ProvisioningStepResult>;
};

export type { DeploymentManifest };
