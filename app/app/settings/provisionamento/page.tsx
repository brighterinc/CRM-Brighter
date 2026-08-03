import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { getCurrentInstallationTenant } from "@/lib/tenants/current-installation";
import { evaluateTenantReadiness } from "@/lib/tenants/readiness";
import type { DeploymentPlan, DeploymentTarget } from "@/lib/deployment";
import {
  buildRollbackPlan,
  generateProvisioningPlan,
  generateProvisioningSummary,
  getProvisioningStepDefinition,
  type ProvisioningStepStatus,
} from "@/lib/provisioning";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<DeploymentPlan, string> = {
  lite: "Lite",
  pro: "Pro",
  dedicated: "Dedicated",
};

const TARGET_LABEL: Record<DeploymentTarget, string> = {
  vercel: "Vercel",
  cloudflare: "Cloudflare",
  vps: "VPS dedicada",
};

const STEP_STATUS_LABEL: Record<ProvisioningStepStatus, string> = {
  pending: "Pendente",
  ready: "Pronta",
  blocked: "Bloqueada",
  running: "Executando",
  completed: "Concluída",
  failed: "Falhou",
  skipped: "Ignorada",
  rolled_back: "Revertida",
};

const STEP_STATUS_VARIANT: Record<ProvisioningStepStatus, "neutral" | "info" | "error" | "warning" | "success"> = {
  pending: "neutral",
  ready: "info",
  blocked: "error",
  running: "warning",
  completed: "success",
  failed: "error",
  skipped: "neutral",
  rolled_back: "neutral",
};

export default async function ProvisionamentoSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const tenant = getCurrentInstallationTenant();
  const manifest = tenant.manifest!;
  const readiness = evaluateTenantReadiness(tenant);
  const plan = generateProvisioningPlan({ tenant, manifest });
  const rollback = buildRollbackPlan(plan);
  const summary = generateProvisioningSummary(plan, manifest);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Provisionamento</h1>
        <p className="text-sm text-muted-foreground">
          Plano de execução desta instalação — etapas, dependências e bloqueios, a partir do manifesto
          de implantação atual.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tela somente leitura — não provisiona nada. Simulação disponível via CLI (
          <code>pnpm provisioning:plan -- --simulate</code>). Ver também{" "}
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
        <h2 className="text-sm font-semibold text-muted-foreground">Tenant / plano</h2>
        <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Cliente</p>
            <p className="font-medium">{tenant.clientName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Plano</p>
            <p className="font-medium">{PLAN_LABEL[plan.plan]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="font-medium">{TARGET_LABEL[plan.target] ?? plan.target}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Domínio</p>
            <p className="font-medium">{tenant.domain}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Manifesto</p>
            <Badge variant={manifest.valid ? "success" : "warning"}>
              {manifest.valid ? "Válido" : "Pendente"}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fingerprint</p>
            <code className="text-xs">{plan.manifestFingerprint}</code>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Prontidão do tenant — {readiness.score}/100 {readiness.ready ? "(pronta)" : "(pendências)"}
        </h2>
        <Card className="p-4">
          {readiness.blockers.length === 0 ? (
            <p className="text-sm text-success-fg">Sem bloqueios de prontidão.</p>
          ) : (
            <ul className="list-inside list-disc text-sm text-error-fg">
              {readiness.blockers.map((b) => (
                <li key={b.id}>{b.label}</li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Plano de execução — status: {plan.status}
        </h2>
        {plan.blockers.length > 0 && (
          <Card className="flex flex-col gap-2 p-4">
            <p className="text-sm font-semibold text-error-fg">Bloqueios</p>
            <ul className="list-inside list-disc text-sm text-error-fg">
              {plan.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Card>
        )}
        {plan.warnings.length > 0 && (
          <Card className="flex flex-col gap-2 p-4">
            <p className="text-sm font-semibold text-warning-fg">Avisos</p>
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {plan.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Etapas ({plan.steps.length})</h2>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Etapa</th>
                <th className="py-2 pr-4">Categoria</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Dependências</th>
              </tr>
            </thead>
            <tbody>
              {plan.steps.map((state, index) => {
                const def = getProvisioningStepDefinition(state.stepId);
                return (
                  <tr key={state.stepId} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{index + 1}</td>
                    <td className="py-2 pr-4 font-medium">{def?.name ?? state.stepId}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{def?.category}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={STEP_STATUS_VARIANT[state.status]}>
                        {STEP_STATUS_LABEL[state.status]}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {def?.dependsOn && def.dependsOn.length > 0 ? def.dependsOn.join(", ") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Rollback</h2>
        <Card className="p-4">
          {rollback.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma etapa concluída — rollback não se aplica ainda.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {rollback.map((r) => (
                <li key={r.stepId}>
                  <span className="font-medium">{r.name}</span> — {r.action}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Resumo operacional</h2>
        <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Esforço estimado</p>
            <p className="font-medium">{summary.estimatedEffort}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Próximo passo recomendado</p>
            <p className="font-medium">{summary.recommendedNextStep}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Simulação</p>
            <p className="font-medium">Simulação disponível via CLI</p>
          </div>
        </Card>
      </section>
    </div>
  );
}
