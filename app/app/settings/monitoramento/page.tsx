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
  deriveIncidentsFromSnapshot,
  generateMonitoringSummary,
  getMonitoringCheckDefinition,
  simulateMonitoringRun,
  type MonitoringCheckResult,
  type MonitoringCheckStatus,
  type MonitoringIncident,
} from "@/lib/monitoring";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<DeploymentPlan, string> = {
  lite: "Lite",
  pro: "Pro",
  dedicated: "Dedicated",
};

const CHECK_STATUS_LABEL: Record<MonitoringCheckStatus, string> = {
  unknown: "Desconhecido",
  pending: "Pendente",
  healthy: "Saudável",
  degraded: "Degradado",
  unhealthy: "Indisponível",
  skipped: "Ignorado",
  disabled: "Desabilitado",
};

const CHECK_STATUS_VARIANT: Record<MonitoringCheckStatus, "neutral" | "info" | "error" | "warning" | "success"> = {
  unknown: "neutral",
  pending: "info",
  healthy: "success",
  degraded: "warning",
  unhealthy: "error",
  skipped: "neutral",
  disabled: "neutral",
};

const INCIDENT_STATUS_LABEL: Record<MonitoringIncident["status"], string> = {
  open: "Aberto",
  acknowledged: "Reconhecido",
  investigating: "Investigando",
  resolved: "Resolvido",
  ignored: "Ignorado",
};

const INCIDENT_SEVERITY_VARIANT: Record<MonitoringIncident["severity"], "neutral" | "info" | "error" | "warning" | "success"> = {
  info: "info",
  warning: "warning",
  critical: "error",
};

function CheckRow({ check }: { check: MonitoringCheckResult }) {
  const def = getMonitoringCheckDefinition(check.checkId);
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 font-medium">{def?.name ?? check.checkId}</td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{def?.category}</td>
      <td className="py-2 pr-4">
        <Badge variant={CHECK_STATUS_VARIANT[check.status]}>{CHECK_STATUS_LABEL[check.status]}</Badge>
      </td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{check.message}</td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{check.nextRecommendedAction ?? "—"}</td>
    </tr>
  );
}

function IncidentRow({ incident }: { incident: MonitoringIncident }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 font-medium">{incident.title}</td>
      <td className="py-2 pr-4">
        <Badge variant={INCIDENT_SEVERITY_VARIANT[incident.severity]}>{incident.severity}</Badge>
      </td>
      <td className="py-2 pr-4">
        <Badge variant="neutral">{INCIDENT_STATUS_LABEL[incident.status]}</Badge>
      </td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{incident.description}</td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{incident.nextAction ?? "—"}</td>
    </tr>
  );
}

export default async function MonitoramentoSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  // Mesmo padrão de `/app/settings/provisionamento` e `/app/settings/operacao`:
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

  const snapshot = simulateMonitoringRun(installation, "healthy");
  const incidents = deriveIncidentsFromSnapshot(snapshot);
  const snapshotWithIncidents = { ...snapshot, incidents };
  const summary = generateMonitoringSummary(installation, snapshotWithIncidents);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Monitoramento</h1>
        <p className="text-sm text-muted-foreground">
          Saúde operacional desta instalação — checks, incidentes e ação recomendada, a partir de um
          snapshot sintético (sem check real nesta Foundation).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tela somente leitura — não executa nenhum check real. Simulação disponível via CLI (
          <code>pnpm monitoring:summary</code>). Ver também{" "}
          <Link href="/app/settings/control-plane" className="underline">
            Control Plane
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
            <p className="text-xs text-muted-foreground">Saúde geral</p>
            <Badge variant={CHECK_STATUS_VARIANT[summary.overallHealth]}>
              {CHECK_STATUS_LABEL[summary.overallHealth]}
            </Badge>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Estatísticas</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Score</p>
            <p className="text-2xl font-semibold">{summary.score}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Checks</p>
            <p className="text-2xl font-semibold">{summary.totalChecks}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Saudáveis</p>
            <p className="text-2xl font-semibold">{summary.healthyCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Degradados</p>
            <p className="text-2xl font-semibold">{summary.degradedCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Indisponíveis</p>
            <p className="text-2xl font-semibold">{summary.unhealthyCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Incidentes críticos</p>
            <p className="text-2xl font-semibold">{summary.criticalIncidents}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Checks atrasados</p>
            <p className="text-2xl font-semibold">{summary.lateChecks}</p>
          </Card>
        </div>
      </section>

      {summary.blockers.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Blockers</h2>
          <Card className="p-4">
            <ul className="list-inside list-disc text-sm text-error-fg">
              {summary.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {summary.warnings.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Warnings</h2>
          <Card className="p-4">
            <ul className="list-inside list-disc text-sm text-warning-fg">
              {summary.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Checks aplicáveis ({snapshot.checks.length})</h2>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Check</th>
                <th className="py-2 pr-4">Categoria</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Mensagem</th>
                <th className="py-2 pr-4">Ação recomendada</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.checks.map((check) => (
                <CheckRow key={check.checkId} check={check} />
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Incidentes ({incidents.length})</h2>
        <Card className="overflow-x-auto p-4">
          {incidents.length === 0 ? (
            <p className="text-sm text-success-fg">Nenhum incidente em aberto.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Título</th>
                  <th className="py-2 pr-4">Severidade</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Descrição</th>
                  <th className="py-2 pr-4">Próxima ação</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <IncidentRow key={incident.id} incident={incident} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Categorias e módulos afetados</h2>
        <Card className="grid gap-3 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Categorias afetadas</p>
            {summary.affectedCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma.</p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1">
                {summary.affectedCategories.map((c) => (
                  <Badge key={c} variant="warning">
                    {c}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Módulos afetados</p>
            {summary.affectedModules.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum.</p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1">
                {summary.affectedModules.map((m) => (
                  <Badge key={m} variant="warning">
                    {m}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
