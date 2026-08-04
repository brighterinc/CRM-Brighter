import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import type { Installation } from "@/lib/control-plane/types";
import { getCurrentInstallationTenant } from "@/lib/tenants/current-installation";
import { generateProvisioningPlan, generateProvisioningSummary } from "@/lib/provisioning";
import type { DeploymentPlan } from "@/lib/deployment";
import {
  createDemoWorkflows,
  generateAutomationSummary,
  simulateWorkflowRun,
  type AutomationRunOverview,
  type AutomationWorkflowOverview,
  type WorkflowDefinitionStatus,
  type WorkflowRunStatus,
} from "@/lib/automation-engine";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<DeploymentPlan, string> = {
  lite: "Lite",
  pro: "Pro",
  dedicated: "Dedicated",
};

const WORKFLOW_STATUS_LABEL: Record<WorkflowDefinitionStatus, string> = {
  draft: "Rascunho",
  active: "Ativo",
  paused: "Pausado",
  archived: "Arquivado",
};

const WORKFLOW_STATUS_VARIANT: Record<WorkflowDefinitionStatus, "neutral" | "info" | "error" | "warning" | "success"> = {
  draft: "neutral",
  active: "success",
  paused: "warning",
  archived: "neutral",
};

const RUN_STATUS_LABEL: Record<WorkflowRunStatus, string> = {
  queued: "Enfileirado",
  running: "Em execução",
  waiting: "Aguardando (delay/retry)",
  completed: "Concluído",
  failed: "Falhou",
  cancelled: "Cancelado",
  skipped_duplicate: "Ignorado (duplicado)",
};

const RUN_STATUS_VARIANT: Record<WorkflowRunStatus, "neutral" | "info" | "error" | "warning" | "success"> = {
  queued: "info",
  running: "info",
  waiting: "warning",
  completed: "success",
  failed: "error",
  cancelled: "neutral",
  skipped_duplicate: "neutral",
};

function WorkflowRow({ workflow }: { workflow: AutomationWorkflowOverview }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 font-medium">{workflow.name}</td>
      <td className="py-2 pr-4">
        <Badge variant={WORKFLOW_STATUS_VARIANT[workflow.status]}>{WORKFLOW_STATUS_LABEL[workflow.status]}</Badge>
      </td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{workflow.triggerId}</td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{workflow.stepCount}</td>
    </tr>
  );
}

function RunRow({ run }: { run: AutomationRunOverview }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 font-mono text-xs">{run.id}</td>
      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{run.workflowId}</td>
      <td className="py-2 pr-4">
        <Badge variant={RUN_STATUS_VARIANT[run.status]}>{RUN_STATUS_LABEL[run.status]}</Badge>
      </td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{run.createdAt}</td>
    </tr>
  );
}

export default async function AutomacaoSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  // Mesmo padrão de `/app/settings/monitoramento`/`/app/settings/provisionamento`:
  // o tenant da instalação ATUAL (`getCurrentInstallationTenant()`) tem `id`
  // deliberadamente não-UUID e nunca passa por `InMemoryInstallationRepository`/
  // `validateInstallationInput` — monta o agregado direto, sem repositório.
  const tenant = getCurrentInstallationTenant();
  const manifest = tenant.manifest!;
  const provisioningPlan = generateProvisioningPlan({ tenant, manifest });
  const provisioningSummary = generateProvisioningSummary(provisioningPlan, manifest);
  const now = new Date().toISOString();
  const installation: Installation = {
    id: tenant.id,
    slug: tenant.clientSlug,
    company: tenant.clientName,
    status: "active",
    createdAt: now,
    updatedAt: now,
    deploymentPlan: tenant.plan,
    tenant,
    branding: tenant.branding,
    modules: tenant.enabledModules,
    deployment: manifest,
    provisioning: provisioningSummary,
    commercial: "production",
    technical: "running",
  };

  const workflows = createDemoWorkflows([installation]);
  const runs = [];
  for (const workflow of workflows) {
    const result = await simulateWorkflowRun("all_success", { installation, workflow });
    runs.push(result.run);
  }
  const summary = generateAutomationSummary(installation, workflows, runs);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Automação</h1>
        <p className="text-sm text-muted-foreground">
          Workflows de automação desta instalação — gatilhos, ações, ramificação, delay, retry e
          histórico, a partir de um catálogo de demonstração (sem execução real nesta Foundation).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tela somente leitura — não executa nenhuma ação real. Simulação disponível via CLI (
          <code>pnpm automation:summary</code>). Ver também{" "}
          <Link href="/app/settings/control-plane" className="underline">
            Control Plane
          </Link>
          ,{" "}
          <Link href="/app/settings/monitoramento" className="underline">
            Monitoramento
          </Link>
          ,{" "}
          <Link href="/app/settings/billing" className="underline">
            Faturamento
          </Link>
          ,{" "}
          <Link href="/app/settings/provisionamento" className="underline">
            Provisionamento
          </Link>
          ,{" "}
          <Link href="/app/settings/operacao" className="underline">
            Operação
          </Link>
          ,{" "}
          <Link href="/app/settings/deployment" className="underline">
            Implantação
          </Link>{" "}
          e{" "}
          <Link href="/app/settings/modules" className="underline">
            Módulos
          </Link>
          .
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Instalação atual</h2>
        <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Cliente</p>
            <p className="font-medium">{installation.company}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Plano</p>
            <p className="font-medium">{PLAN_LABEL[installation.deploymentPlan]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Workflows ativos</p>
            <p className="font-medium">{summary.activeWorkflows} de {summary.totalWorkflows}</p>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Estatísticas</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Workflows</p>
            <p className="text-2xl font-semibold">{summary.totalWorkflows}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Runs</p>
            <p className="text-2xl font-semibold">{summary.totalRuns}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Concluídos</p>
            <p className="text-2xl font-semibold">{summary.completedRuns}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Falhos</p>
            <p className="text-2xl font-semibold">{summary.failedRuns}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Em andamento/espera</p>
            <p className="text-2xl font-semibold">{summary.waitingRuns}</p>
          </Card>
        </div>
      </section>

      {summary.blockers.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Blockers de configuração</h2>
          <Card className="p-4">
            <ul className="list-inside list-disc text-sm text-error-fg">
              {summary.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Workflows ({summary.workflows.length})</h2>
        <Card className="overflow-x-auto p-4">
          {summary.workflows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum workflow configurado — habilite o módulo &quot;Webhooks&quot; em Módulos para ver o
              catálogo de demonstração.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Workflow</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Gatilho</th>
                  <th className="py-2 pr-4">Etapas</th>
                </tr>
              </thead>
              <tbody>
                {summary.workflows.map((w) => (
                  <WorkflowRow key={w.id} workflow={w} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Runs recentes ({summary.recentRuns.length})</h2>
        <Card className="overflow-x-auto p-4">
          {summary.recentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum run ainda.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Run</th>
                  <th className="py-2 pr-4">Workflow</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentRuns.map((r) => (
                  <RunRow key={r.id} run={r} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </div>
  );
}
