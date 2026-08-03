/**
 * Resumo operacional (dashboard) da Control Plane — função pura que
 * combina uma lista de `Installation` em algo pronto pra tela/CLI. Sem I/O,
 * sem segredo — mesma doutrina de `lib/provisioning/summary.ts` e
 * `lib/tenants/summary.ts`.
 */
import { WAITING_INSTALLATION_STATUSES } from "./status";
import type { CommercialStatus, DeploymentPlan, Installation, InstallationStatus, TechnicalStatus } from "./types";

export type ControlPlaneSummary = {
  total: number;
  byStatus: Record<InstallationStatus, number>;
  byCommercial: Record<CommercialStatus, number>;
  byTechnical: Record<TechnicalStatus, number>;
  byPlan: Record<DeploymentPlan, number>;
  active: number;
  inProvisioning: number;
  withErrors: number;
  waitingDns: number;
  waitingSsl: number;
  waitingCustomer: number;
  /** Contagem de IDs de módulo DISTINTOS habilitados em pelo menos 1 instalação. */
  totalActiveModules: number;
  /** ISO-8601 UTC — momento em que este resumo foi calculado (nunca persistido). */
  generatedAt: string;
};

function countBy<T extends string>(items: T[]): Record<T, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
  return counts as Record<T, number>;
}

export function generateControlPlaneSummary(installations: Installation[]): ControlPlaneSummary {
  const byStatus = countBy(installations.map((i) => i.status));
  const byCommercial = countBy(installations.map((i) => i.commercial));
  const byTechnical = countBy(installations.map((i) => i.technical));
  const byPlan = countBy(installations.map((i) => i.deploymentPlan));

  const distinctModules = new Set(installations.flatMap((i) => i.modules));

  return {
    total: installations.length,
    byStatus,
    byCommercial,
    byTechnical,
    byPlan,
    active: installations.filter((i) => i.status === "active").length,
    inProvisioning: installations.filter((i) => i.status === "provisioning" || i.status === "deploying").length,
    withErrors: installations.filter((i) => i.status === "error" || i.technical === "failed").length,
    waitingDns: installations.filter((i) => i.status === "waiting_dns").length,
    waitingSsl: installations.filter((i) => i.status === "waiting_ssl").length,
    waitingCustomer: installations.filter((i) => i.status === "waiting_customer").length,
    totalActiveModules: distinctModules.size,
    generatedAt: new Date().toISOString(),
  };
}

/** Instalações que estão aguardando alguma ação externa (`WAITING_INSTALLATION_STATUSES`). */
export function selectWaitingInstallations(installations: Installation[]): Installation[] {
  return installations.filter((i) => (WAITING_INSTALLATION_STATUSES as InstallationStatus[]).includes(i.status));
}

export function renderControlPlaneSummaryMarkdown(summary: ControlPlaneSummary): string {
  const lines: string[] = [
    "# Control Plane — resumo",
    "",
    `- **Total de instalações:** ${summary.total}`,
    `- **Ativas:** ${summary.active}`,
    `- **Em implantação:** ${summary.inProvisioning}`,
    `- **Com erro:** ${summary.withErrors}`,
    `- **Módulos habilitados (distintos):** ${summary.totalActiveModules}`,
    "",
    "## Por plano",
    ...Object.entries(summary.byPlan).map(([plan, count]) => `- ${plan}: ${count}`),
    "",
    "## Por status",
    ...Object.entries(summary.byStatus).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## Aguardando ação externa",
    `- DNS: ${summary.waitingDns}`,
    `- SSL: ${summary.waitingSsl}`,
    `- Cliente: ${summary.waitingCustomer}`,
    "",
    `_Gerado em ${summary.generatedAt}_`,
  ];

  return lines.join("\n") + "\n";
}
