import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { branding } from "@/lib/branding";
import { env } from "@/lib/env";
import { generateDeploymentManifest, type DeploymentPlan, type ChecklistItem } from "@/lib/deployment";
import { getDeploymentPlan, getEnabledModules } from "@/lib/modules/runtime";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<DeploymentPlan, string> = {
  lite: "Lite",
  pro: "Pro",
  dedicated: "Dedicated",
};

const TARGET_LABEL: Record<string, string> = {
  vercel: "Vercel",
  cloudflare: "Cloudflare",
  vps: "VPS dedicada",
};

const INFRA_KEYS = [
  "database",
  "auth",
  "storage",
  "edgeFunctions",
  "redis",
  "worker",
  "scheduler",
  "whatsapp",
  "email",
  "ai",
] as const;

const INFRA_LABEL: Record<(typeof INFRA_KEYS)[number], string> = {
  database: "Banco de dados",
  auth: "Autenticação",
  storage: "Armazenamento",
  edgeFunctions: "Edge Functions",
  redis: "Redis",
  worker: "Worker",
  scheduler: "Scheduler",
  whatsapp: "WhatsApp",
  email: "E-mail",
  ai: "IA",
};

const CATEGORY_LABEL: Record<string, string> = {
  infra: "Infraestrutura",
  branding: "Marca",
  channel: "Canal",
  ai: "Inteligência artificial",
  email: "E-mail",
};

/** Deriva um slug legível do host de `NEXT_PUBLIC_APP_URL` — só pra exibição, não é a fonte de verdade de organização. */
function deriveInstallSlug(appUrl: string): string {
  try {
    const hostname = new URL(appUrl).hostname.toLowerCase();
    const slug = hostname.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug.length > 0 ? slug : "instalacao";
  } catch {
    return "instalacao";
  }
}

function deriveInstallDomain(appUrl: string): string {
  try {
    return new URL(appUrl).hostname;
  } catch {
    return appUrl;
  }
}

function groupChecklistByCategory(items: ChecklistItem[]): [string, ChecklistItem[]][] {
  const groups = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  return Array.from(groups.entries());
}

export default async function DeploymentSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const plan = getDeploymentPlan();
  const enabledModuleIds = getEnabledModules().map((m) => m.id);
  const install = branding();
  const domain = deriveInstallDomain(env.NEXT_PUBLIC_APP_URL);
  const slug = deriveInstallSlug(env.NEXT_PUBLIC_APP_URL);

  const manifest = generateDeploymentManifest({
    clientName: install.name,
    clientSlug: slug,
    domain,
    plan,
    requestedModules: enabledModuleIds,
    branding: {
      appName: install.name,
      legalName: install.legalName,
      logoUrl: install.logoUrl ?? undefined,
      faviconUrl: install.faviconUrl ?? undefined,
      supportEmail: install.supportEmail ?? undefined,
      websiteUrl: install.websiteUrl ?? undefined,
      fromName: install.fromName,
      fromEmail: install.fromEmail ?? undefined,
    },
  });

  const checklistGroups = groupChecklistByCategory(manifest.checklist);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Implantação</h1>
        <p className="text-sm text-muted-foreground">
          Manifesto técnico desta instalação — plano{" "}
          <span className="font-medium text-foreground">{PLAN_LABEL[manifest.plan]}</span>, target
          recomendado{" "}
          <span className="font-medium text-foreground">
            {TARGET_LABEL[manifest.target] ?? manifest.target}
          </span>
          .
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tela somente leitura — não edita, não provisiona e nunca mostra valor de segredo. Gerado a
          partir de <code>DEPLOYMENT_PLAN</code>, <code>ENABLED_MODULES</code>, marca e{" "}
          <code>NEXT_PUBLIC_APP_URL</code> atuais desta instalação.
        </p>
      </header>

      {manifest.blockers.length > 0 && (
        <Card className="flex flex-col gap-2 p-4">
          <p className="text-sm font-semibold text-error-fg">Bloqueios</p>
          <ul className="list-inside list-disc text-sm text-error-fg">
            {manifest.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Card>
      )}

      {manifest.warnings.length > 0 && (
        <Card className="flex flex-col gap-2 p-4">
          <p className="text-sm font-semibold text-warning-fg">Avisos</p>
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            {manifest.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Cliente / instalação</h2>
        <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Nome</p>
            <p className="font-medium">{manifest.client.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Slug (derivado)</p>
            <p className="font-medium">{manifest.client.slug}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Domínio</p>
            <p className="font-medium">{manifest.client.domain}</p>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Módulos ativos ({manifest.enabledModules.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          {manifest.enabledModules.map((id) => (
            <Badge key={id} variant="success">
              {id}
            </Badge>
          ))}
        </div>
        {manifest.rejectedModules.length > 0 && (
          <div className="flex flex-col gap-1 pt-2">
            <p className="text-xs text-muted-foreground">Rejeitados nesta resolução:</p>
            {manifest.rejectedModules.map((r) => (
              <p key={r.moduleId} className="text-xs text-warning-fg">
                {r.moduleId} — {r.reason}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Infraestrutura exigida</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant={manifest.infrastructure.vpsRequired ? "warning" : "neutral"}>
            VPS {manifest.infrastructure.vpsRequired ? "obrigatória" : "não obrigatória"}
          </Badge>
          <Badge variant={manifest.infrastructure.docker ? "warning" : "neutral"}>
            Docker {manifest.infrastructure.docker ? "obrigatório" : "não usado"}
          </Badge>
          <Badge variant={manifest.infrastructure.proxy ? "warning" : "neutral"}>
            Proxy/SSL {manifest.infrastructure.proxy ? "obrigatório" : "não usado"}
          </Badge>
          {INFRA_KEYS.filter((key) => manifest.infrastructure[key]).map((key) => (
            <Badge key={key} variant="info">
              {INFRA_LABEL[key]}
            </Badge>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Variáveis de ambiente (só nomes — nunca valores)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <p className="mb-2 text-xs font-semibold text-foreground">
              Obrigatórias ({manifest.environment.required.length})
            </p>
            <ul className="flex flex-col gap-1 font-mono text-xs text-muted-foreground">
              {manifest.environment.required.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-xs font-semibold text-foreground">
              Opcionais ({manifest.environment.optional.length})
            </p>
            <ul className="flex flex-col gap-1 font-mono text-xs text-muted-foreground">
              {manifest.environment.optional.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Checklist da instalação</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {checklistGroups.map(([category, items]) => (
            <Card key={category} className="p-4">
              <p className="mb-2 text-xs font-semibold text-foreground">
                {CATEGORY_LABEL[category] ?? category}
              </p>
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    <Badge variant={item.required ? "default" : "neutral"}>
                      {item.required ? "Obrigatório" : "Opcional"}
                    </Badge>
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
