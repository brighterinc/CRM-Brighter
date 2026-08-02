import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { getCurrentInstallationTenant } from "@/lib/tenants/current-installation";
import { evaluateTenantReadiness } from "@/lib/tenants/readiness";
import { exportTenantSafe } from "@/lib/tenants/export";
import { summarizeTenantCommercial, summarizeTenantTechnical } from "@/lib/tenants/summary";
import type {
  TenantCommercialStatus,
  TenantReadinessItem,
  TenantTechnicalStatus,
} from "@/lib/tenants/types";
import type { DeploymentPlan, DeploymentTarget } from "@/lib/deployment";

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

const COMMERCIAL_STATUS_LABEL: Record<TenantCommercialStatus, string> = {
  lead: "Lead",
  proposal: "Proposta",
  contracted: "Contratado",
  onboarding: "Onboarding",
  active: "Ativo",
  suspended: "Suspenso",
  cancelled: "Cancelado",
};

const TECHNICAL_STATUS_LABEL: Record<TenantTechnicalStatus, string> = {
  draft: "Rascunho",
  configuration_pending: "Configuração pendente",
  ready_to_provision: "Pronta para implantar",
  provisioning: "Implantando",
  validation: "Em validação",
  live: "Em operação",
  degraded: "Degradada",
  archived: "Arquivada",
};

const READINESS_TEXT_CLASS = {
  blocker: "list-inside list-disc text-sm text-error-fg",
  warning: "list-inside list-disc text-sm text-warning-fg",
  completed: "list-inside list-disc text-sm text-success-fg",
} as const;

function ReadinessItemList({
  items,
  variant,
}: {
  items: TenantReadinessItem[];
  variant: keyof typeof READINESS_TEXT_CLASS;
}) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">Nenhum item.</p>;
  return (
    <ul className={READINESS_TEXT_CLASS[variant]}>
      {items.map((item) => (
        <li key={item.id}>{item.label}</li>
      ))}
    </ul>
  );
}

export default async function OperacaoSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const tenant = getCurrentInstallationTenant();
  const readiness = evaluateTenantReadiness(tenant);
  const technical = summarizeTenantTechnical(tenant, readiness);
  const commercial = summarizeTenantCommercial(tenant, readiness);
  const safeExport = exportTenantSafe(tenant);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Operação</h1>
        <p className="text-sm text-muted-foreground">
          Prontidão comercial e técnica desta instalação — cliente, plano, módulos, infraestrutura e
          domínio.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tela somente leitura — não edita, não provisiona e nunca mostra valor de segredo. Ver também{" "}
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
        <h2 className="text-sm font-semibold text-muted-foreground">Cliente / instalação</h2>
        <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Nome</p>
            <p className="font-medium">{commercial.clientName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Slug</p>
            <p className="font-medium">{commercial.clientSlug}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Domínio</p>
            <p className="font-medium">{technical.domain}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Plano</p>
            <p className="font-medium">{PLAN_LABEL[technical.plan]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status comercial</p>
            <Badge variant="neutral">{COMMERCIAL_STATUS_LABEL[commercial.commercialStatus]}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status técnico</p>
            <Badge variant="neutral">{TECHNICAL_STATUS_LABEL[technical.technicalStatus]}</Badge>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Prontidão — {readiness.score}/100 {readiness.ready ? "(pronta)" : "(pendências)"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="mb-2 text-xs font-semibold text-error-fg">
              Bloqueios ({readiness.blockers.length})
            </p>
            <ReadinessItemList items={readiness.blockers} variant="blocker" />
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-xs font-semibold text-warning-fg">
              Avisos ({readiness.warnings.length})
            </p>
            <ReadinessItemList items={readiness.warnings} variant="warning" />
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-xs font-semibold text-success-fg">
              Concluído ({readiness.completed.length})
            </p>
            <ReadinessItemList items={readiness.completed} variant="completed" />
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Marca</h2>
        <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Nome de marca</p>
            <p className="font-medium">{tenant.branding.appName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Razão social</p>
            <p className="font-medium">{tenant.branding.legalName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">E-mail de suporte</p>
            <p className="font-medium">{tenant.branding.supportEmail ?? "—"}</p>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Módulos habilitados ({technical.enabledModules.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          {technical.enabledModules.map((id) => (
            <Badge key={id} variant="success">
              {id}
            </Badge>
          ))}
        </div>
        {technical.rejectedModules.length > 0 && (
          <div className="flex flex-col gap-1 pt-2">
            <p className="text-xs text-muted-foreground">Rejeitados nesta resolução:</p>
            {technical.rejectedModules.map((r) => (
              <p key={r.moduleId} className="text-xs text-warning-fg">
                {r.moduleId} — {r.reason}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Infraestrutura</h2>
        <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="font-medium">
              {technical.target ? (TARGET_LABEL[technical.target] ?? technical.target) : "Configuração pendente"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Referência (provider / project ref)</p>
            <p className="font-medium">
              {technical.infrastructureReference?.provider ??
                technical.infrastructureReference?.projectReference ??
                "Configuração pendente"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Manifesto de implantação</p>
            <Badge variant={technical.manifestValid ? "success" : "warning"}>
              {technical.manifestValid ? "Válido" : "Pendente"}
            </Badge>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Supabase (referência pública)</h2>
        <Card className="grid gap-3 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Project ref</p>
            <p className="font-medium">{technical.supabase?.projectRef ?? "Configuração pendente"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">URL do projeto</p>
            <p className="font-medium">{technical.supabase?.projectUrl ?? "Configuração pendente"}</p>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Datas e observações</h2>
        <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Criado em</p>
            <p className="font-medium">{commercial.createdAt}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Atualizado em</p>
            <p className="font-medium">{commercial.updatedAt}</p>
          </div>
          <div className="sm:col-span-3">
            <p className="text-xs text-muted-foreground">Observações</p>
            <p className="font-medium">{commercial.notes ?? "—"}</p>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Export seguro (JSON)</h2>
        <p className="text-xs text-muted-foreground">
          Mesmo JSON que a CLI <code>pnpm tenant:summary</code> gera — nunca contém segredo, mesmo se o
          objeto de origem tivesse propriedades extras.
        </p>
        <Card className="overflow-x-auto p-4">
          <pre className="text-xs">{JSON.stringify(safeExport, null, 2)}</pre>
        </Card>
      </section>
    </div>
  );
}
