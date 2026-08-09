import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import type { DeploymentPlan } from "@/lib/deployment";
import type { Installation } from "@/lib/control-plane/types";
import { generateProvisioningPlan, generateProvisioningSummary } from "@/lib/provisioning";
import {
  attachAdaptersToProvisioningPlan,
  attachProvisioningAdapterSummaryToInstallationSummary,
  createDefaultProvisioningAdapterRegistry,
  executeProvisioningDryRun,
  generateProvisioningAdapterSummary,
  generateProvisioningRollbackPreview,
  renderProvisioningAdapterSummaryMarkdown,
  type ProvisioningAdapterResultStatus,
} from "@/lib/provisioning-adapters";
import { getCurrentInstallationTenant } from "@/lib/tenants/current-installation";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<DeploymentPlan, string> = {
  lite: "Lite",
  pro: "Pro",
  dedicated: "Dedicated",
};

const RESULT_STATUS_VARIANT: Record<ProvisioningAdapterResultStatus, "neutral" | "info" | "error" | "warning" | "success"> = {
  simulated: "info",
  ready: "success",
  blocked: "error",
  failed: "error",
  skipped: "neutral",
};

const READINESS_VARIANT: Record<"ready" | "partial" | "blocked", "success" | "warning" | "error"> = {
  ready: "success",
  partial: "warning",
  blocked: "error",
};

export default async function ProvisioningAdaptersSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  // Mesmo padrão de `/app/settings/modulos-licencas`/`/app/settings/provisionamento`:
  // o tenant da instalação ATUAL, agregado direto — nunca passa por
  // `InMemoryInstallationRepository`.
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

  const registry = createDefaultProvisioningAdapterRegistry();
  const attachment = attachAdaptersToProvisioningPlan(provisioningPlan, registry);
  const { outcomes } = await executeProvisioningDryRun(provisioningPlan, {
    installationId: installation.id,
    tenantId: tenant.id,
    registry,
  });
  const rollbackPreview = generateProvisioningRollbackPreview(outcomes);
  const blockers = [...provisioningPlan.blockers, ...outcomes.flatMap((o) => o.result?.blockers ?? [])];
  const warnings = [...provisioningPlan.warnings, ...outcomes.flatMap((o) => o.result?.warnings ?? [])];

  const summary = generateProvisioningAdapterSummary({
    scenario: "instalação atual",
    installation,
    plan: provisioningPlan,
    outcomes,
    rollbackPreview,
    blockers,
    warnings,
  });
  const summaryMarkdown = renderProvisioningAdapterSummaryMarkdown(summary);
  const overview = attachProvisioningAdapterSummaryToInstallationSummary(installation, summary, registry);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Adaptadores de provisionamento</h1>
        <p className="text-sm text-muted-foreground">
          Cobertura de providers, capabilities e prontidão de dry-run desta instalação — sem execução real
          nesta Foundation.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tela somente leitura — nenhum botão de execução real. Simulação disponível via CLI (
          <code>pnpm provisioning:adapters</code>). Ver também{" "}
          <Link href="/app/settings/provisionamento" className="underline">
            Provisionamento
          </Link>
          ,{" "}
          <Link href="/app/settings/modulos-licencas" className="underline">
            Módulos e licenças
          </Link>
          ,{" "}
          <Link href="/app/settings/control-plane" className="underline">
            Control Plane
          </Link>
          ,{" "}
          <Link href="/app/settings/monitoramento" className="underline">
            Monitoramento
          </Link>{" "}
          e{" "}
          <Link href="/app/settings/deployment" className="underline">
            Deployment
          </Link>
          .
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Instalação atual</h2>
        <Card className="grid gap-3 p-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Cliente</p>
            <p className="font-medium">{installation.company}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Plano</p>
            <p className="font-medium">{PLAN_LABEL[installation.deploymentPlan]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="font-medium">{provisioningPlan.target}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Prontidão</p>
            <Badge variant={READINESS_VARIANT[overview.readiness]}>{overview.readiness}</Badge>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Etapas ({summary.totalSteps})</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Mapeadas</p>
            <p className="text-2xl font-semibold">{summary.mappedSteps}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Sem provider</p>
            <p className="text-2xl font-semibold">{summary.unmappedSteps}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Prontas</p>
            <p className="text-2xl font-semibold">{summary.readySteps}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Bloqueadas</p>
            <p className="text-2xl font-semibold">{summary.blockedSteps}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Rollback disponível</p>
            <p className="text-2xl font-semibold">
              {summary.rollbackAvailableSteps}/{summary.rollbackTotalSteps}
            </p>
          </Card>
        </div>
      </section>

      {(blockers.length > 0 || warnings.length > 0) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Blockers e avisos</h2>
          <Card className="p-4">
            {blockers.length > 0 && (
              <ul className="list-inside list-disc text-sm text-error-fg">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {warnings.length > 0 && (
              <ul className="list-inside list-disc text-sm text-warning-fg">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Cobertura por provider ({summary.providerCoverage.length})</h2>
        <Card className="overflow-x-auto p-4">
          {summary.providerCoverage.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma etapa desta instalação tem provider mapeado.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2 pr-4">Etapas</th>
                  <th className="py-2 pr-4">Prontas</th>
                  <th className="py-2 pr-4">Bloqueadas</th>
                </tr>
              </thead>
              <tbody>
                {summary.providerCoverage.map((p) => (
                  <tr key={p.provider} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{p.provider}</td>
                    <td className="py-2 pr-4">{p.stepsCount}</td>
                    <td className="py-2 pr-4">{p.ready}</td>
                    <td className="py-2 pr-4">{p.blocked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Etapas do plano ({attachment.steps.length})</h2>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Etapa</th>
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Operação</th>
                <th className="py-2 pr-4">Status do adapter</th>
                <th className="py-2 pr-4">Resultado (dry-run)</th>
              </tr>
            </thead>
            <tbody>
              {attachment.steps.map((s) => {
                const outcome = outcomes.find((o) => o.stepId === s.stepId);
                return (
                  <tr key={s.stepId} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{s.stepId}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{s.provider ?? "—"}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{s.operation ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={s.adapterStatus === "resolved" ? "success" : s.adapterStatus === "unmapped" ? "neutral" : "warning"}>{s.adapterStatus}</Badge>
                    </td>
                    <td className="py-2 pr-4">
                      {outcome?.result ? <Badge variant={RESULT_STATUS_VARIANT[outcome.result.status]}>{outcome.result.status}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Rollback preview ({rollbackPreview.length})</h2>
        <Card className="overflow-x-auto p-4">
          {rollbackPreview.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma etapa com resultado pronto ainda.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Etapa</th>
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2 pr-4">Reversível</th>
                  <th className="py-2 pr-4">Passos teóricos</th>
                </tr>
              </thead>
              <tbody>
                {rollbackPreview.map((r) => (
                  <tr key={`${r.stepId}-${r.provider}`} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{r.stepId}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{r.provider}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={r.reversible ? "success" : "neutral"}>{r.reversible ? "sim" : "não"}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{r.steps.join("; ") || "—"}</td>
                  </tr>
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
