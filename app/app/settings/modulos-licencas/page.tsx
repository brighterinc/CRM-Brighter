import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { getBillingPlanDefinition } from "@/lib/billing/catalog";
import { createDemoBillingSubscriptions } from "@/lib/billing/repository";
import type { DeploymentPlan } from "@/lib/deployment";
import type { Installation } from "@/lib/control-plane/types";
import { generateProvisioningPlan, generateProvisioningSummary } from "@/lib/provisioning";
import { getCurrentInstallationTenant } from "@/lib/tenants/current-installation";
import {
  buildMarketplaceCatalog,
  createDemoBundles,
  createDemoLicenses,
  createTrial,
  generateMarketplaceSummary,
  renderMarketplaceSummaryMarkdown,
  resolveMarketplaceBillingEntitlements,
  resolveMarketplaceEntitlements,
  startTrial,
  validateMarketplaceCatalog,
  type LicenseStatus,
  type MarketplaceModuleDefinition,
  type ModuleLicense,
  type ModuleTrial,
} from "@/lib/marketplace";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<DeploymentPlan, string> = {
  lite: "Lite",
  pro: "Pro",
  dedicated: "Dedicated",
};

const LICENSE_STATUS_VARIANT: Record<LicenseStatus, "neutral" | "info" | "error" | "warning" | "success"> = {
  draft: "neutral",
  trial: "info",
  active: "success",
  grace_period: "warning",
  suspended: "error",
  expired: "error",
  cancelled: "neutral",
  revoked: "error",
};

function CatalogRow({ module, authorized }: { module: MarketplaceModuleDefinition; authorized: boolean }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 font-medium">{module.name}</td>
      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{module.moduleId}</td>
      <td className="py-2 pr-4">
        <Badge variant="neutral">{module.status}</Badge>
      </td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{module.visibility}</td>
      <td className="py-2 pr-4">
        <Badge variant={authorized ? "success" : "neutral"}>{authorized ? "autorizado" : "não autorizado"}</Badge>
      </td>
    </tr>
  );
}

function LicenseRow({ license }: { license: ModuleLicense }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 font-mono text-xs">{license.moduleId}</td>
      <td className="py-2 pr-4">
        <Badge variant={LICENSE_STATUS_VARIANT[license.status]}>{license.status}</Badge>
      </td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{license.source}</td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{license.version ?? "—"}</td>
    </tr>
  );
}

function TrialRow({ trial }: { trial: ModuleTrial }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 font-mono text-xs">{trial.moduleId}</td>
      <td className="py-2 pr-4">
        <Badge variant="info">{trial.status}</Badge>
      </td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">até {new Date(trial.endsAt).toLocaleDateString("pt-BR")}</td>
    </tr>
  );
}

export default async function MarketplaceSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  // Mesmo padrão de `/app/settings/outreach`/`/app/settings/automacao`: o
  // tenant da instalação ATUAL, agregado direto — nunca passa por
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

  const catalog = buildMarketplaceCatalog();
  const catalogIssues = validateMarketplaceCatalog(catalog);
  const licenses = createDemoLicenses([installation]);
  const bundles = createDemoBundles();

  // Trial de DEMONSTRAÇÃO — 1 módulo com `trialAvailable`, ilustra a seção
  // "Trials" sem nunca cobrar/persistir de verdade.
  const trialModule = catalog.find((m) => m.trialAvailable && m.moduleId !== "channel.whatsapp");
  const trials: ModuleTrial[] = trialModule
    ? [startTrial(createTrial({ id: "demo-trial", tenantId: tenant.id, installationId: installation.id, moduleId: trialModule.moduleId, startsAt: now, durationDays: trialModule.trialDurationDays ?? 14 }, trialModule), now)]
    : [];

  // Assinatura de DEMONSTRAÇÃO — mesmo catálogo de demo do Billing Engine
  // (`createDemoBillingSubscriptions`), no plano comercial desta instalação.
  const billingPlan = getBillingPlanDefinition(installation.deploymentPlan);
  const subscription = createDemoBillingSubscriptions([installation])[0];

  const billingResult =
    billingPlan && subscription
      ? resolveMarketplaceBillingEntitlements({
          installation: { deploymentPlan: installation.deploymentPlan, modules: installation.modules },
          subscription: { ...subscription, installationId: installation.id, tenantId: tenant.id },
          billingPlan,
        })
      : null;

  const entitlements = resolveMarketplaceEntitlements({
    installation: { enabledModules: installation.modules },
    catalog,
    licenses,
    trials,
    billingAuthorizedModuleIds: billingResult?.authorizedModules,
  });

  const summary = generateMarketplaceSummary({ installation, catalog, licenses, trials, entitlements, bundles });
  const summaryMarkdown = renderMarketplaceSummaryMarkdown(summary);

  const authorizedSet = new Set(entitlements.authorizedModules);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Módulos e licenças</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo comercial, ofertas, bundles, licenças e trials desta instalação — a partir de um
          catálogo de demonstração, sem ativação real nesta Foundation.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tela somente leitura — nenhum botão de ativar ou comprar. Simulação disponível via CLI (
          <code>pnpm marketplace:summary</code>). Ver também{" "}
          <Link href="/app/settings/modules" className="underline">
            Módulos
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
          <Link href="/app/settings/control-plane" className="underline">
            Control Plane
          </Link>{" "}
          e{" "}
          <Link href="/app/settings/operacao" className="underline">
            Operação
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
            <p className="text-xs text-muted-foreground">Módulos no catálogo</p>
            <p className="font-medium">{summary.availableModulesCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Prontidão de ativação</p>
            <Badge variant={summary.activationReadiness === "ready" ? "success" : "warning"}>{summary.activationReadiness}</Badge>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Incluídos, addons e situação</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Incluídos</p>
            <p className="text-2xl font-semibold">{summary.includedModules.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Addons</p>
            <p className="text-2xl font-semibold">{summary.addonModules.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Trials ativos</p>
            <p className="text-2xl font-semibold">{summary.activeTrials}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Bundles</p>
            <p className="text-2xl font-semibold">{summary.bundlesCount}</p>
          </Card>
        </div>
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
        <h2 className="text-sm font-semibold text-muted-foreground">Catálogo ({catalog.length})</h2>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Módulo</th>
                <th className="py-2 pr-4">Id técnico</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Visibilidade</th>
                <th className="py-2 pr-4">Entitlement</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((m) => (
                <CatalogRow key={m.id} module={m} authorized={authorizedSet.has(m.moduleId)} />
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Licenças ({licenses.length})</h2>
        <Card className="overflow-x-auto p-4">
          {licenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma licença registrada.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Módulo</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Fonte</th>
                  <th className="py-2 pr-4">Versão</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((l) => (
                  <LicenseRow key={l.id} license={l} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Trials ({trials.length})</h2>
        <Card className="overflow-x-auto p-4">
          {trials.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum trial ativo.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Módulo</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Expira</th>
                </tr>
              </thead>
              <tbody>
                {trials.map((t) => (
                  <TrialRow key={t.id} trial={t} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Bundles ({bundles.length})</h2>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Bundle</th>
                <th className="py-2 pr-4">Plano mínimo</th>
                <th className="py-2 pr-4">Módulos</th>
              </tr>
            </thead>
            <tbody>
              {bundles.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 font-medium">{b.name}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{PLAN_LABEL[b.minimumPlan]}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{b.modules.map((m) => m.moduleId).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {catalogIssues.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Compatibilidade do catálogo comercial x Module Engine</h2>
          <Card className="p-4">
            <ul className="list-inside list-disc text-sm">
              {catalogIssues.map((issue, index) => (
                <li key={index} className={issue.severity === "blocker" ? "text-error-fg" : "text-warning-fg"}>
                  [{issue.severity}] {issue.message}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Resumo (Markdown — mesmo formato da CLI)</h2>
        <Card className="overflow-x-auto p-4">
          <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{summaryMarkdown}</pre>
        </Card>
      </section>
    </div>
  );
}
