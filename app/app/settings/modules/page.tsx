import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDeploymentPlan, getModuleAvailability } from "@/lib/modules/runtime";
import type { ModuleAvailability } from "@/lib/modules/resolver";
import type { ModuleStatus, ModuleUnavailableReason } from "@/lib/modules/catalog";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<string, string> = {
  lite: "Lite",
  pro: "Pro",
  dedicated: "Dedicated",
};

const STATUS_LABEL: Record<ModuleStatus, string> = {
  stable: "Estável",
  beta: "Beta",
  planned: "Planejado",
};

const REASON_LABEL: Record<ModuleUnavailableReason, string> = {
  plan_not_allowed: "Indisponível no plano de implantação atual",
  explicitly_disabled: "Desativado por configuração (DISABLED_MODULES)",
  dependency_disabled: "Depende de um módulo desativado",
  not_enabled_by_default: "Não habilitado por padrão nesta instalação",
};

const CATEGORY_LABEL: Record<string, string> = {
  core: "Núcleo",
  channel: "Canais",
  ai: "Inteligência artificial",
  automation: "Automação",
  integration: "Integrações",
  compliance: "Conformidade",
  analytics: "Métricas",
};

const INFRA_LABEL: Record<string, string> = {
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

function groupByCategory(items: ModuleAvailability[]): [string, ModuleAvailability[]][] {
  const groups = new Map<string, ModuleAvailability[]>();
  for (const item of items) {
    const list = groups.get(item.module.category) ?? [];
    list.push(item);
    groups.set(item.module.category, list);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export default async function ModulesSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const plan = getDeploymentPlan();
  const availability = getModuleAvailability();
  const groups = groupByCategory(availability);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Módulos</h1>
        <p className="text-sm text-muted-foreground">
          Recursos disponíveis nesta instalação. Plano de implantação atual:{" "}
          <span className="font-medium text-foreground">{PLAN_LABEL[plan] ?? plan}</span>.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tela somente leitura — a fonte da verdade continua sendo a configuração de ambiente
          (<code>DEPLOYMENT_PLAN</code>, <code>ENABLED_MODULES</code>, <code>DISABLED_MODULES</code>).
        </p>
      </header>

      <div className="flex flex-col gap-6">
        {groups.map(([category, items]) => (
          <section key={category} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {CATEGORY_LABEL[category] ?? category}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(({ module: mod, enabled, reason }) => (
                <Card key={mod.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{mod.name}</p>
                      <p className="text-xs text-muted-foreground">{mod.description}</p>
                    </div>
                    <Badge variant={enabled ? "success" : "neutral"}>
                      {enabled ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    <Badge variant={mod.status === "planned" ? "warning" : "info"}>
                      {STATUS_LABEL[mod.status]}
                    </Badge>
                    {Object.entries(mod.requires)
                      .filter(([, needed]) => needed)
                      .map(([key]) => (
                        <Badge key={key} variant="neutral">
                          {INFRA_LABEL[key] ?? key}
                        </Badge>
                      ))}
                  </div>

                  {mod.dependsOn && mod.dependsOn.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Depende de: {mod.dependsOn.join(", ")}
                    </p>
                  )}

                  {!enabled && reason && (
                    <p className="text-xs text-warning-fg">{REASON_LABEL[reason]}</p>
                  )}
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
