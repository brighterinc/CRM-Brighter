/**
 * Repositório abstrato do Brighter Automation Engine — Foundation v1.
 *
 * `WorkflowRepository` é a interface; `InMemoryWorkflowRepository` é a
 * única implementação desta etapa — DEMONSTRAÇÃO/TESTE, não produção: sem
 * tabela, sem migration, sem Supabase real (mesma doutrina de
 * `InMemoryBillingRepository`/`InMemoryMonitoringRepository`). Cada
 * instância começa vazia — nunca singleton global mutável da aplicação.
 * Persistência real fica pra uma futura Control Plane com persistência (ver
 * ROADMAP.md) — o futuro `SupabaseWorkflowRepository` implementaria a MESMA
 * interface `WorkflowRepository` definida aqui.
 */
import { createDemoInstallations } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";

import type { WorkflowDefinition, WorkflowRun } from "./types";

export class WorkflowNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`workflow_not_found: ${id}`);
    this.name = "WorkflowNotFoundError";
  }
}

export class WorkflowRunNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`workflow_run_not_found: ${id}`);
    this.name = "WorkflowRunNotFoundError";
  }
}

export interface WorkflowRepository {
  saveWorkflow(workflow: WorkflowDefinition): Promise<WorkflowDefinition>;
  findWorkflow(id: string): Promise<WorkflowDefinition | null>;
  listWorkflows(installationId?: string): Promise<WorkflowDefinition[]>;
  saveRun(run: WorkflowRun): Promise<WorkflowRun>;
  findRun(id: string): Promise<WorkflowRun | null>;
  listRuns(workflowId?: string): Promise<WorkflowRun[]>;
}

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly runs = new Map<string, WorkflowRun>();

  constructor(seed: { workflows?: WorkflowDefinition[]; runs?: WorkflowRun[] } = {}) {
    for (const workflow of seed.workflows ?? []) this.workflows.set(workflow.id, workflow);
    for (const run of seed.runs ?? []) this.runs.set(run.id, run);
  }

  async saveWorkflow(workflow: WorkflowDefinition): Promise<WorkflowDefinition> {
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  async findWorkflow(id: string): Promise<WorkflowDefinition | null> {
    return this.workflows.get(id) ?? null;
  }

  async listWorkflows(installationId?: string): Promise<WorkflowDefinition[]> {
    const all = Array.from(this.workflows.values());
    return installationId ? all.filter((w) => w.installationId === installationId) : all;
  }

  async saveRun(run: WorkflowRun): Promise<WorkflowRun> {
    this.runs.set(run.id, run);
    return run;
  }

  async findRun(id: string): Promise<WorkflowRun | null> {
    return this.runs.get(id) ?? null;
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    const all = Array.from(this.runs.values());
    return workflowId ? all.filter((r) => r.workflowId === workflowId) : all;
  }
}

/**
 * Catálogo local/in-memory de DEMONSTRAÇÃO — 1 workflow por instalação de
 * `createDemoInstallations()` (`lib/control-plane/`) que já tem
 * `automation.webhooks` habilitado. Demonstra ramificação (onSuccess ≠
 * onFailure), delay e retry num grafo pequeno de 4 etapas: `lead.created` →
 * marca tag → chama webhook (retry 3x) → sucesso: manda WhatsApp de
 * confirmação (delay 60s) / falha: atribui responsável manualmente. Usado
 * por testes, CLI e a tela admin. Nunca dado real, nunca persistido.
 */
export function createDemoWorkflows(installations: Installation[] = createDemoInstallations()): WorkflowDefinition[] {
  return installations
    .filter((installation) => installation.modules.includes("automation.webhooks"))
    .map((installation, index) => {
      const now = installation.createdAt;
      const id = `demo-wf-${index}-${installation.id}`;
      return {
        id,
        name: `Boas-vindas a novo lead — ${installation.company}`,
        description: "Marca o lead como novo, notifica um webhook externo e confirma por WhatsApp (ou atribui um responsável se o webhook falhar).",
        installationId: installation.id,
        triggerId: "lead.created",
        conditions: [],
        entryStepId: "tag_new_lead",
        status: "active" as const,
        steps: [
          {
            id: "tag_new_lead",
            name: "Marcar lead como novo",
            actionId: "add_tag",
            config: { tags: ["novo-lead"] },
            onSuccess: "notify_webhook",
          },
          {
            id: "notify_webhook",
            name: "Notificar webhook externo",
            actionId: "call_webhook",
            config: { url: "https://example-crm-integration.invalid/webhook" },
            retry: { maxAttempts: 3, backoffSeconds: 30 },
            onSuccess: "send_confirmation",
            onFailure: "assign_owner_fallback",
          },
          {
            id: "send_confirmation",
            name: "Confirmar por WhatsApp",
            actionId: "send_whatsapp_message",
            config: { template: "confirmacao_novo_lead" },
            delaySeconds: 60,
          },
          {
            id: "assign_owner_fallback",
            name: "Atribuir responsável (fallback)",
            actionId: "assign_owner",
            config: { userId: "demo-fallback-owner" },
          },
        ],
        createdAt: now,
        updatedAt: now,
      };
    });
}
