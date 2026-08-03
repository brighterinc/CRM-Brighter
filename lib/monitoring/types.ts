/**
 * Tipos centrais do Brighter Monitoring Engine — Foundation v1.
 *
 * Este módulo NUNCA executa health check real, NUNCA chama rede, NUNCA
 * consulta DNS/SSL/Supabase/Vercel/VPS/Docker/Redis/WAHA/Chatwoot/Evolution,
 * e NUNCA acessa a Lumina (`/opt/brighter-lumina`, porta 8000). Trabalha só
 * com snapshots sintéticos, adaptadores fake/noop e dados em memória.
 *
 * `MonitoringSnapshot` é deliberadamente calculado a partir de uma
 * `Installation` inteira (`lib/control-plane/types.ts` — já é `Tenant` +
 * `DeploymentManifest` + `ProvisioningSummary` + branding + módulos), nunca
 * de `tenant`/`manifest`/`provisioningPlan` soltos — evita a combinação
 * divergente que o `validateInstallationInput` da Control Plane já existe
 * pra impedir (CLAUDE.md anti-pattern #2, "duplicação sem source of truth
 * declarado").
 */
import type { DeploymentPlan } from "@/lib/deployment";
import type { ModuleInfraRequirements } from "@/lib/modules/catalog";

/** Resultado observado de UM check — nunca inferido, sempre um dado de entrada (real ou simulado). */
export type MonitoringCheckStatus =
  | "unknown"
  | "pending"
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "skipped"
  | "disabled";

/** Gravidade de um check quando ele falha — usada pro cálculo de saúde geral e pros blockers/warnings. */
export type MonitoringSeverity = "info" | "warning" | "critical";

/** Estado de UMA rodada de avaliação de monitoramento (não confundir com `MonitoringCheckStatus`). */
export type MonitoringRunStatus = "draft" | "running" | "completed" | "partial" | "failed";

/** Categoria de superfície observada — usada pro catálogo, agrupamento de resumo e filtro de tela. */
export type MonitoringCategory =
  | "application"
  | "domain"
  | "dns"
  | "ssl"
  | "database"
  | "authentication"
  | "storage"
  | "redis"
  | "worker"
  | "scheduler"
  | "email"
  | "whatsapp"
  | "chatwoot"
  | "evolution"
  | "waha"
  | "backup"
  | "monitoring"
  | "integration";

/** Cadência esperada de um check — usada só pra detectar check "atrasado", nunca agenda nada de verdade. */
export type MonitoringCheckCadence = "manual" | "hourly" | "daily" | "weekly";

/**
 * Definição estática de um check — o QUE existe e QUANDO se aplica. Nenhuma
 * `MonitoringCheckDefinition` executa nada; ela só descreve.
 */
export type MonitoringCheckDefinition = {
  id: string;
  name: string;
  description: string;
  category: MonitoringCategory;
  appliesToPlans: DeploymentPlan[];
  /** Ids de `lib/modules/catalog.ts::MODULE_CATALOG` — check só se aplica se TODOS estiverem em `installation.modules`. */
  requiredModules?: string[];
  /**
   * Flags de `ModuleInfraRequirements` exigidas no `DeploymentManifest` da
   * instalação pra este check entrar na lista de aplicáveis (mesma
   * convenção de `ProvisioningStepDefinition.requiresInfra`, ver
   * `lib/provisioning/types.ts`). Ausente/vazio = sem checagem extra de
   * infra além de plano/módulo.
   */
  requiresInfra?: Array<keyof ModuleInfraRequirements>;
  dependsOn?: string[];
  severityWhenFailed: MonitoringSeverity;
  expectedCadence?: MonitoringCheckCadence;
  enabledByDefault: boolean;
};

/** Resultado observado (sintético nesta Foundation) de UM check, numa instalação, num instante. */
export type MonitoringCheckResult = {
  checkId: string;
  status: MonitoringCheckStatus;
  /** ISO-8601 UTC. */
  observedAt: string;
  durationMs?: number;
  message: string;
  /** Já deve passar por `sanitizeMonitoringCheckResult` antes de logar/persistir — nunca segredo. */
  metadata?: Record<string, unknown>;
  nextRecommendedAction?: string;
};

/** Rodada completa de avaliação de saúde de UMA instalação, num instante. */
export type MonitoringSnapshot = {
  id: string;
  installationId: string;
  tenantId: string;
  plan: DeploymentPlan;
  status: MonitoringRunStatus;
  overallHealth: MonitoringCheckStatus;
  /** 0–100, determinístico — ver `evaluateMonitoringSnapshot` em `evaluator.ts`. */
  score: number;
  checks: MonitoringCheckResult[];
  incidents: MonitoringIncident[];
  blockers: string[];
  warnings: string[];
  /** Ids de check aplicável sem `MonitoringCheckResult` correspondente. */
  missingCheckIds: string[];
  /** Ids de check cujo `observedAt` já passou da janela de tolerância da própria `expectedCadence`. */
  lateCheckIds: string[];
  nextRecommendedAction?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
};

/** Erro estruturado — nunca mensagem genérica solta. `field` usa dot-path. */
export type MonitoringValidationError = { field: string; message: string };

export type MonitoringIncidentStatus = "open" | "acknowledged" | "investigating" | "resolved" | "ignored";

/** Incidente derivado de um check em falha — nunca criado à mão fora de `deriveIncidentsFromSnapshot`. */
export type MonitoringIncident = {
  id: string;
  installationId: string;
  tenantId: string;
  title: string;
  description: string;
  severity: MonitoringSeverity;
  status: MonitoringIncidentStatus;
  sourceCheckId: string;
  /** ISO-8601 UTC. */
  openedAt: string;
  /** ISO-8601 UTC. */
  acknowledgedAt?: string;
  /** ISO-8601 UTC. */
  resolvedAt?: string;
  assignedTo?: string;
  nextAction?: string;
  /** Já deve passar por `sanitizeMonitoringIncident` antes de logar/persistir — nunca segredo. */
  metadata?: Record<string, unknown>;
};

export type { DeploymentPlan, ModuleInfraRequirements };
