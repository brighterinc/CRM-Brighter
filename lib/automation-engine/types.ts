/**
 * Tipos centrais do Brighter Automation Engine — Foundation v1.
 *
 * Este módulo NUNCA executa ação real (sem WAHA, sem webhook HTTP real, sem
 * update em `crm_leads`/`contacts`), NUNCA agenda nada de verdade (sem
 * `setTimeout`/cron/worker/fila real), NUNCA persiste (repositório
 * in-memory) e NUNCA acessa a Lumina. É a camada de domínio que modela "o
 * que uma instalação White Label PODE automatizar" — gatilhos, condições,
 * ações, ramificação, delay, retry, idempotência e histórico — como
 * simulação determinística, no mesmo nível de abstração que Billing/
 * Monitoring (nunca no nível de execução real do CRM).
 *
 * Distinto do motor legado do CRM (`lib/automation/` — `automation_rules`/
 * `automation_rule_runs` reais, por organização, disparado por
 * `event_log`): aquele executa de verdade hoje. Este é a modelagem de
 * PLATAFORMA da capacidade de automação de uma `Installation` da Control
 * Plane — nunca reimplementa, nunca importa, nunca substitui o motor
 * legado. Ver `docs/automation/automation-engine.md` §"Dois sistemas
 * chamados automação".
 *
 * Prefixo `Workflow`/`Automation` em todo tipo/função exportada — nunca os
 * mesmos nomes do motor legado (`ActionExecutor`/`ActionCtx`/
 * `RuleCondition`/etc.), mesmo sem haver barrel compartilhado.
 */
import type { DeploymentPlan } from "@/lib/deployment";

// ---------------------------------------------------------------------------
// Catálogo (declarativo — ver catalog.ts)
// ---------------------------------------------------------------------------

export type WorkflowTriggerCategory = "event" | "schedule" | "webhook";

export type WorkflowTriggerDefinition = {
  id: string;
  name: string;
  description: string;
  category: WorkflowTriggerCategory;
  /** Id de módulo do Module Engine (`lib/modules/catalog.ts`) exigido pra este gatilho estar disponível. */
  requiresModule: string;
  appliesToPlans: DeploymentPlan[];
};

export type WorkflowActionCategory = "crm" | "messaging" | "integration";

export type WorkflowActionCatalogEntry = {
  id: string;
  name: string;
  description: string;
  category: WorkflowActionCategory;
  requiresModule: string;
  appliesToPlans: DeploymentPlan[];
  supportsRetry: boolean;
  supportsDelay: boolean;
  /** Sempre `true` nesta Foundation — todo executor fake/noop é determinístico por construção. */
  idempotent: boolean;
  /**
   * Id do `type` literal correspondente em `lib/automation/actions/*.ts` (motor
   * legado), só como documentação de correspondência conceitual — NUNCA
   * importado, NUNCA usado em runtime. Ver header do arquivo.
   */
  legacyActionType?: string;
};

// ---------------------------------------------------------------------------
// Condições
// ---------------------------------------------------------------------------

export type WorkflowConditionOperator = "eq" | "neq" | "contains" | "exists" | "not_exists";

export type WorkflowCondition = {
  field: string;
  op: WorkflowConditionOperator;
  /** Ausente pra `exists`/`not_exists` (não comparam valor). */
  value?: string;
};

// ---------------------------------------------------------------------------
// Definição de workflow (grafo de etapas)
// ---------------------------------------------------------------------------

export type WorkflowRetryPolicy = {
  maxAttempts: number;
  backoffSeconds: number;
};

export type WorkflowActionStep = {
  id: string;
  name: string;
  /** Referencia `WorkflowActionCatalogEntry.id` — nunca a definição completa. */
  actionId: string;
  config: Record<string, unknown>;
  /** Próxima etapa se esta tiver sucesso — ausente = fim do fluxo nesse ramo. */
  onSuccess?: string;
  /** Próxima etapa se esta falhar (após esgotar retry, se houver) — ausente = fim do fluxo nesse ramo. */
  onFailure?: string;
  /** Segundos de espera ANTES desta etapa rodar. Nunca um sleep real — vira `waiting_delay` + `nextAttemptAt`. */
  delaySeconds?: number;
  retry?: WorkflowRetryPolicy;
};

export type WorkflowDefinitionStatus = "draft" | "active" | "paused" | "archived";

/**
 * `installationId` referencia `Installation.id` da Control Plane
 * (`lib/control-plane/`) — nunca duplica `Tenant`/`DeploymentManifest`.
 */
export type WorkflowDefinition = {
  id: string;
  name: string;
  description: string;
  installationId: string;
  /** Referencia `WorkflowTriggerDefinition.id`. */
  triggerId: string;
  conditions: WorkflowCondition[];
  entryStepId: string;
  steps: WorkflowActionStep[];
  status: WorkflowDefinitionStatus;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Execução (run) — estado, história, idempotência
// ---------------------------------------------------------------------------

export type WorkflowStepStatus =
  | "pending"
  | "ready"
  | "waiting_delay"
  | "running"
  | "retrying"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled";

export type WorkflowStepRunState = {
  stepId: string;
  status: WorkflowStepStatus;
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  /** ISO-8601 UTC — quando o delay/retry libera a etapa. Nunca lido por um timer real nesta Foundation. */
  nextAttemptAt?: string;
  lastError?: string;
};

export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped_duplicate";

export type WorkflowHistoryLevel = "info" | "warning" | "error" | "success";

export type WorkflowHistoryEntry = {
  /** ISO-8601 UTC. */
  timestamp: string;
  runId: string;
  workflowId: string;
  stepId?: string;
  level: WorkflowHistoryLevel;
  event: string;
  message: string;
  /** Já deve ter passado por `sanitizeDeep` antes de sair do domínio — nunca segredo. */
  metadata: Record<string, unknown>;
};

/**
 * `triggerFingerprint` é o mecanismo de idempotência: um hash determinístico
 * de `workflowId` + payload do gatilho (nunca de dado sensível cru — ver
 * `planner.ts`). NÃO é o `Idempotency-Key`/Upstash real da API (CLAUDE.md
 * §"Idempotência & event sourcing leve") — é a MESMA ideia modelada no
 * domínio, em memória, sem Redis.
 */
export type WorkflowRun = {
  id: string;
  workflowId: string;
  installationId: string;
  status: WorkflowRunStatus;
  triggerFingerprint: string;
  currentStepId?: string;
  steps: WorkflowStepRunState[];
  history: WorkflowHistoryEntry[];
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Execução de UMA etapa — contrato do adaptador (ver executor.ts)
// ---------------------------------------------------------------------------

export type WorkflowActionContext = {
  runId: string;
  workflowId: string;
  installationId: string;
  stepId: string;
  triggerPayload: Record<string, unknown>;
};

export type WorkflowActionResultStatus = "success" | "failed" | "skipped";

export type WorkflowActionResult = {
  stepId: string;
  status: WorkflowActionResultStatus;
  message?: string;
  detail?: Record<string, unknown>;
};

/**
 * Adaptador abstrato de execução de ação — nesta Foundation v1 só existem
 * implementações fake (`NoopWorkflowActionAdapter`,
 * `InMemoryWorkflowActionAdapter` em `executor.ts`). Um adaptador real que
 * de fato chamasse `lib/automation/actions/*` fica pra uma fase futura
 * ("Automation Adapters Foundation", mesmo padrão da "Provisioning Adapters
 * Foundation" — ver ROADMAP.md).
 */
export type WorkflowActionAdapter = {
  supports(actionId: string): boolean;
  execute(actionId: string, ctx: WorkflowActionContext, config: Record<string, unknown>): Promise<WorkflowActionResult>;
};

/** Erro estruturado — nunca mensagem genérica solta. `field` usa dot-path. */
export type WorkflowValidationError = { field: string; message: string };

export type { DeploymentPlan };
