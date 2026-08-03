import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import {
  createDemoInstallations,
  generateControlPlaneSummary,
  getCommercialStatusDefinition,
  getInstallationStatusDefinition,
  getTechnicalStatusDefinition,
  type CommercialStatus,
  type Installation,
  type InstallationStatus,
  type TechnicalStatus,
} from "@/lib/control-plane";
import type { DeploymentPlan } from "@/lib/deployment";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<DeploymentPlan, string> = {
  lite: "Lite",
  pro: "Pro",
  dedicated: "Dedicated",
};

const STATUS_VARIANT: Record<InstallationStatus, "neutral" | "info" | "error" | "warning" | "success"> = {
  planned: "neutral",
  provisioning: "info",
  deploying: "info",
  waiting_dns: "warning",
  waiting_ssl: "warning",
  waiting_customer: "warning",
  active: "success",
  maintenance: "warning",
  paused: "neutral",
  archived: "neutral",
  error: "error",
};

const TECHNICAL_VARIANT: Record<TechnicalStatus, "neutral" | "info" | "error" | "warning" | "success"> = {
  draft: "neutral",
  validated: "info",
  ready: "info",
  deploying: "info",
  running: "success",
  warning: "warning",
  failed: "error",
};

const COMMERCIAL_VARIANT: Record<CommercialStatus, "neutral" | "info" | "error" | "warning" | "success"> = {
  lead: "neutral",
  proposal: "info",
  contract: "info",
  payment_pending: "warning",
  implementation: "info",
  production: "success",
  cancelled: "error",
};

function InstallationRow({ installation }: { installation: Installation }) {
  const statusDef = getInstallationStatusDefinition(installation.status);
  const commercialDef = getCommercialStatusDefinition(installation.commercial);
  const technicalDef = getTechnicalStatusDefinition(installation.technical);

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 font-medium">{installation.company}</td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{installation.slug}</td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{installation.tenant.domain}</td>
      <td className="py-2 pr-4">{PLAN_LABEL[installation.deploymentPlan]}</td>
      <td className="py-2 pr-4">
        <Badge variant={STATUS_VARIANT[installation.status]}>{statusDef.label}</Badge>
      </td>
      <td className="py-2 pr-4">
        <Badge variant={COMMERCIAL_VARIANT[installation.commercial]}>{commercialDef.label}</Badge>
      </td>
      <td className="py-2 pr-4">
        <Badge variant={TECHNICAL_VARIANT[installation.technical]}>{technicalDef.label}</Badge>
      </td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{installation.modules.length}</td>
    </tr>
  );
}

export default async function ControlPlaneSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const installations = createDemoInstallations();
  const summary = generateControlPlaneSummary(installations);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Control Plane</h1>
        <p className="text-sm text-muted-foreground">
          Visão de todas as instalações White Label da Brighter — estado comercial, técnico e de
          implantação de cada cliente.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tela somente leitura — não provisiona, não implanta e não altera nada. Catálogo de
          demonstração nesta Foundation v1 (sem persistência real). Ver também{" "}
          <Link href="/app/settings/operacao" className="underline">
            Operação
          </Link>{" "}
          e{" "}
          <Link href="/app/settings/provisionamento" className="underline">
            Provisionamento
          </Link>{" "}
          da instalação atual.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Estatísticas</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold">{summary.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Ativas</p>
            <p className="text-2xl font-semibold">{summary.active}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Em implantação</p>
            <p className="text-2xl font-semibold">{summary.inProvisioning}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Com erro</p>
            <p className="text-2xl font-semibold">{summary.withErrors}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Aguardando DNS/SSL</p>
            <p className="text-2xl font-semibold">{summary.waitingDns + summary.waitingSsl}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Módulos habilitados</p>
            <p className="text-2xl font-semibold">{summary.totalActiveModules}</p>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Por plano</h2>
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(PLAN_LABEL) as DeploymentPlan[]).map((plan) => (
            <Card key={plan} className="p-4">
              <p className="text-xs text-muted-foreground">{PLAN_LABEL[plan]}</p>
              <p className="text-2xl font-semibold">{summary.byPlan[plan] ?? 0}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Instalações ({installations.length})</h2>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Empresa</th>
                <th className="py-2 pr-4">Slug</th>
                <th className="py-2 pr-4">Domínio</th>
                <th className="py-2 pr-4">Plano</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Comercial</th>
                <th className="py-2 pr-4">Técnico</th>
                <th className="py-2 pr-4">Módulos</th>
              </tr>
            </thead>
            <tbody>
              {installations.map((installation) => (
                <InstallationRow key={installation.id} installation={installation} />
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
