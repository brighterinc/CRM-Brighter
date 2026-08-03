import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { getCurrentInstallationTenant } from "@/lib/tenants/current-installation";
import { generateProvisioningPlan, generateProvisioningSummary } from "@/lib/provisioning";
import type { DeploymentPlan } from "@/lib/deployment";
import type { Installation } from "@/lib/control-plane/types";
import {
  createDemoBillingSubscriptions,
  generateBillingSummary,
  renderBillingSummaryMarkdown,
  type BillingOperationalSummary,
  type SubscriptionStatus,
} from "@/lib/billing";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<DeploymentPlan, string> = {
  lite: "Lite",
  pro: "Pro",
  dedicated: "Dedicated",
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  draft: "Rascunho",
  trial: "Trial",
  active: "Ativa",
  past_due: "Inadimplente",
  grace_period: "Grace period",
  suspended: "Suspensa",
  cancelled: "Cancelada",
  expired: "Expirada",
};

const STATUS_VARIANT: Record<SubscriptionStatus, "neutral" | "info" | "error" | "warning" | "success"> = {
  draft: "neutral",
  trial: "info",
  active: "success",
  past_due: "warning",
  grace_period: "warning",
  suspended: "error",
  cancelled: "error",
  expired: "error",
};

function ModuleBadgeList({ modules, variant }: { modules: string[]; variant: "success" | "info" }) {
  if (modules.length === 0) return <p className="text-sm text-muted-foreground">Nenhum.</p>;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {modules.map((m) => (
        <Badge key={m} variant={variant}>
          {m}
        </Badge>
      ))}
    </div>
  );
}

export default async function BillingSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  // Mesmo padrão de `/app/settings/monitoramento`/`/app/settings/provisionamento`: o tenant da
  // instalação ATUAL, agregado direto sem repositório — nunca passa por `InMemoryInstallationRepository`.
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

  // Assinatura de DEMONSTRAÇÃO — nesta Foundation não existe gateway nem persistência real, então a
  // tela usa o mesmo catálogo de demo do Billing Engine (`createDemoBillingSubscriptions`) escolhendo
  // a assinatura cujo plano bate com o desta instalação (nunca dado real de cobrança).
  const demoSubscriptions = createDemoBillingSubscriptions();
  const subscription =
    demoSubscriptions.find((s) => s.planId === installation.deploymentPlan) ?? demoSubscriptions[0];

  let summary: BillingOperationalSummary | null = null;
  if (subscription) {
    summary = generateBillingSummary({ installation, subscription: { ...subscription, installationId: installation.id, tenantId: tenant.id } }, now);
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Faturamento</h1>
        <p className="text-sm text-muted-foreground">
          Plano, assinatura, ciclo, módulos contratados e situação financeira desta instalação —
          domínio puro nesta Foundation (sem gateway, sem cobrança real).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tela somente leitura — nenhum botão de cobrança real. Simulação disponível via CLI (
          <code>pnpm billing:summary</code>). Ver também{" "}
          <Link href="/app/settings/control-plane" className="underline">
            Control Plane
          </Link>
          ,{" "}
          <Link href="/app/settings/monitoramento" className="underline">
            Monitoramento
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

      {!summary ? (
        <Card className="max-w-xl p-6">
          <p className="text-sm text-muted-foreground">Nenhuma assinatura de demonstração disponível para este plano.</p>
        </Card>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Instalação atual</h2>
            <Card className="grid gap-3 p-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Cliente</p>
                <p className="font-medium">{summary.company}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Plano técnico</p>
                <p className="font-medium">{PLAN_LABEL[installation.deploymentPlan]}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Plano comercial</p>
                <p className="font-medium">{summary.planName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Situação financeira</p>
                <Badge variant={STATUS_VARIANT[summary.status]}>{STATUS_LABEL[summary.status]}</Badge>
              </div>
            </Card>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Ciclo e renovação</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Ciclo</p>
                <p className="text-lg font-semibold">{summary.cycle}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Período atual</p>
                <p className="text-xs font-medium">
                  {new Date(summary.currentPeriodStart).toLocaleDateString("pt-BR")} →{" "}
                  {new Date(summary.currentPeriodEnd).toLocaleDateString("pt-BR")}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Cancelamento agendado</p>
                <p className="text-lg font-semibold">{summary.cancelAtPeriodEnd ? "Sim" : "Não"}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Próxima ação</p>
                <p className="text-sm font-semibold">{summary.financialRecommendation}</p>
              </Card>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Módulos contratados</h2>
            <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Incluídos no plano</p>
                <ModuleBadgeList modules={summary.includedModules} variant="success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Extras contratados</p>
                <ModuleBadgeList modules={summary.extraModules} variant="info" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sem autorização</p>
                <ModuleBadgeList modules={summary.unauthorizedModules} variant="info" />
              </div>
            </Card>
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
            <h2 className="text-sm font-semibold text-muted-foreground">Sugestão de upgrade</h2>
            <Card className="p-4 text-sm">{summary.suggestedUpgrade ? `Considerar upgrade para "${summary.suggestedUpgrade}".` : "Nenhuma sugestão no momento."}</Card>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Resumo (Markdown, mesmo formato da CLI)</h2>
            <Card className="overflow-x-auto p-4">
              <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{renderBillingSummaryMarkdown(summary)}</pre>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
