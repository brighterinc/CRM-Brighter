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
  generateOutreachSummary,
  renderOutreachSummaryMarkdown,
  simulateOutreachScenario,
  type CampaignStatus,
  type OutreachCampaignOverview,
  type OutreachEnrollmentOverview,
} from "@/lib/outreach";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<DeploymentPlan, string> = {
  lite: "Lite",
  pro: "Pro",
  dedicated: "Dedicated",
};

const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  active: "Ativa",
  paused: "Pausada",
  completed: "Concluída",
  cancelled: "Cancelada",
  archived: "Arquivada",
  blocked: "Bloqueada",
};

const CAMPAIGN_STATUS_VARIANT: Record<CampaignStatus, "neutral" | "info" | "error" | "warning" | "success"> = {
  draft: "neutral",
  scheduled: "info",
  active: "success",
  paused: "warning",
  completed: "success",
  cancelled: "neutral",
  archived: "neutral",
  blocked: "error",
};

function CampaignRow({ campaign }: { campaign: OutreachCampaignOverview }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 font-medium">{campaign.name}</td>
      <td className="py-2 pr-4">
        <Badge variant={CAMPAIGN_STATUS_VARIANT[campaign.status]}>{CAMPAIGN_STATUS_LABEL[campaign.status]}</Badge>
      </td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{campaign.channel}</td>
      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{campaign.cadenceId}</td>
    </tr>
  );
}

function EnrollmentRow({ enrollment }: { enrollment: OutreachEnrollmentOverview }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 font-mono text-xs">{enrollment.id}</td>
      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{enrollment.campaignId}</td>
      <td className="py-2 pr-4">
        <Badge variant="neutral">{enrollment.status}</Badge>
      </td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{enrollment.currentStepId ?? "—"}</td>
    </tr>
  );
}

export default async function OutreachSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  // Mesmo padrão de `/app/settings/automacao`/`/app/settings/monitoramento`:
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

  const result = await simulateOutreachScenario("healthy", { installation });
  const summary = generateOutreachSummary({
    installation,
    campaigns: [result.campaign],
    cadences: [result.cadence],
    enrollments: result.enrollments,
    metrics: result.metrics,
    extraBlockers: result.blockers,
    extraWarnings: result.warnings,
  });
  const summaryMarkdown = renderOutreachSummaryMarkdown(summary);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Outreach &amp; Cadências</h1>
        <p className="text-sm text-muted-foreground">
          Campanhas, cadências multi-etapa, público, throttling, respostas e IA opcional desta
          instalação — a partir de um catálogo de demonstração (sem envio real nesta Foundation).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tela somente leitura — não dispara nenhum envio real. Simulação disponível via CLI (
          <code>pnpm outreach:summary</code>). Ver também{" "}
          <Link href="/app/settings/automacao" className="underline">
            Automação
          </Link>
          ,{" "}
          <Link href="/app/settings/billing" className="underline">
            Faturamento
          </Link>
          ,{" "}
          <Link href="/app/settings/monitoramento" className="underline">
            Monitoramento
          </Link>
          ,{" "}
          <Link href="/app/settings/control-plane" className="underline">
            Control Plane
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
            <p className="text-xs text-muted-foreground">Campanhas ativas</p>
            <p className="font-medium">
              {summary.activeCampaigns} de {summary.totalCampaigns}
            </p>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Público e envio</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Audiência</p>
            <p className="text-2xl font-semibold">{result.metrics.audienceSize}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Elegíveis</p>
            <p className="text-2xl font-semibold">{result.metrics.eligibleContacts}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Bloqueados</p>
            <p className="text-2xl font-semibold">{result.metrics.blockedContacts}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Enviados (simulado)</p>
            <p className="text-2xl font-semibold">{result.metrics.simulatedSent}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Respostas</p>
            <p className="text-2xl font-semibold">{result.metrics.replied}</p>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Qualificação e opt-out</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Interessados</p>
            <p className="text-2xl font-semibold">{result.metrics.interested}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Qualificados</p>
            <p className="text-2xl font-semibold">{result.metrics.qualified}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Transferidos</p>
            <p className="text-2xl font-semibold">{result.metrics.transferred}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Opt-outs</p>
            <p className="text-2xl font-semibold">{result.metrics.optedOut}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Falhas</p>
            <p className="text-2xl font-semibold">{result.metrics.failed}</p>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Janela de envio e throttling</h2>
        <Card className="grid gap-3 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Janela configurada</p>
            <p className="font-medium">
              {result.cadence.sendingWindow
                ? `${result.cadence.sendingWindow.startHour}h–${result.cadence.sendingWindow.endHour}h (${result.cadence.sendingWindow.timezone})`
                : "não configurada"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Throttling</p>
            <p className="font-medium">
              {result.cadence.throttlingPolicy
                ? `até ${result.cadence.throttlingPolicy.maxPerMinute}/min, ${result.cadence.throttlingPolicy.maxPerDay}/dia`
                : "não configurado"}
            </p>
          </div>
        </Card>
      </section>

      {(summary.blockers.length > 0 || summary.warnings.length > 0) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Blockers e avisos</h2>
          <Card className="p-4">
            {summary.blockers.length > 0 && (
              <ul className="list-inside list-disc text-sm text-error-fg">
                {summary.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {summary.warnings.length > 0 && (
              <ul className="list-inside list-disc text-sm text-warning-fg">
                {summary.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Campanhas ({summary.campaigns.length})</h2>
        <Card className="overflow-x-auto p-4">
          {summary.campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma campanha configurada.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Campanha</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Canal</th>
                  <th className="py-2 pr-4">Cadência</th>
                </tr>
              </thead>
              <tbody>
                {summary.campaigns.map((c) => (
                  <CampaignRow key={c.id} campaign={c} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Enrollments recentes ({summary.recentEnrollments.length})</h2>
        <Card className="overflow-x-auto p-4">
          {summary.recentEnrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum enrollment ainda.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Enrollment</th>
                  <th className="py-2 pr-4">Campanha</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Etapa atual</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentEnrollments.map((e) => (
                  <EnrollmentRow key={e.id} enrollment={e} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Resumo (Markdown — mesmo formato da CLI)</h2>
        <Card className="overflow-x-auto p-4">
          <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{summaryMarkdown}</pre>
        </Card>
      </section>
    </div>
  );
}
