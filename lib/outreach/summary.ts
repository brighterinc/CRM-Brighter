/**
 * Resumo operacional da Outreach & AI Cadence Engine — Foundation v1.
 *
 * `generateOutreachSummary` NUNCA altera `Installation`/`OutreachCampaign`/
 * `OutreachCadence`/`OutreachEnrollment` — produz um view model próprio pra
 * tela admin e pro CLI. Reusa `validateCadence`/`validateCampaign` (nunca
 * reimplementa a checagem de entitlement) só pra agregar blockers de
 * configuração.
 */
import type { Installation } from "@/lib/control-plane/types";

import { validateCadence } from "./validation";
import { generateCampaignMetricsSummaryLines } from "./metrics";
import type {
  CampaignStatus,
  DeploymentPlan,
  OutreachCadence,
  OutreachCampaign,
  OutreachEnrollment,
  OutreachMetrics,
} from "./types";

export type OutreachCampaignOverview = {
  id: string;
  name: string;
  status: CampaignStatus;
  channel: string;
  cadenceId: string;
};

export type OutreachEnrollmentOverview = {
  id: string;
  campaignId: string;
  status: string;
  currentStepId?: string;
  createdAt: string;
};

export type OutreachOperationalSummary = {
  installationId: string;
  slug: string;
  company: string;
  plan: DeploymentPlan;
  totalCampaigns: number;
  activeCampaigns: number;
  totalEnrollments: number;
  metrics: OutreachMetrics;
  campaigns: OutreachCampaignOverview[];
  recentEnrollments: OutreachEnrollmentOverview[];
  blockers: string[];
  warnings: string[];
  generatedAt: string;
};

export type GenerateOutreachSummaryInput = {
  installation: Installation;
  campaigns: OutreachCampaign[];
  cadences: OutreachCadence[];
  enrollments: OutreachEnrollment[];
  metrics: OutreachMetrics;
  extraBlockers?: string[];
  extraWarnings?: string[];
};

export function generateOutreachSummary(input: GenerateOutreachSummaryInput): OutreachOperationalSummary {
  const { installation, campaigns, cadences, enrollments, metrics, extraBlockers = [], extraWarnings = [] } = input;

  const blockers: string[] = [...extraBlockers];
  for (const cadence of cadences) {
    const errors = validateCadence({ cadence, enabledModuleIds: installation.modules, deploymentPlan: installation.deploymentPlan });
    for (const e of errors) blockers.push(`cadência "${cadence.name}" (${e.field}): ${e.message}`);
  }

  const recentEnrollments = [...enrollments]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)
    .map((e) => ({ id: e.id, campaignId: e.campaignId, status: e.status, currentStepId: e.currentStepId, createdAt: e.createdAt }));

  return {
    installationId: installation.id,
    slug: installation.slug,
    company: installation.company,
    plan: installation.deploymentPlan,
    totalCampaigns: campaigns.length,
    activeCampaigns: campaigns.filter((c) => c.status === "active").length,
    totalEnrollments: enrollments.length,
    metrics,
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status, channel: c.channel, cadenceId: c.cadenceId })),
    recentEnrollments,
    blockers,
    warnings: extraWarnings,
    generatedAt: new Date().toISOString(),
  };
}

/** Renderiza `generateOutreachSummary` como Markdown — usado pela CLI e pela tela admin. */
export function renderOutreachSummaryMarkdown(summary: OutreachOperationalSummary): string {
  const lines: string[] = [
    `# Outreach & Cadências — ${summary.company} (${summary.slug})`,
    "",
    `- Plano: ${summary.plan}`,
    `- Campanhas: ${summary.totalCampaigns} (ativas: ${summary.activeCampaigns})`,
    `- Enrollments: ${summary.totalEnrollments}`,
    "",
    "## Métricas",
    ...generateCampaignMetricsSummaryLines(summary.metrics).map((l) => `- ${l}`),
    "",
    "## Campanhas",
    ...(summary.campaigns.length > 0
      ? summary.campaigns.map((c) => `- **${c.name}** (\`${c.id}\`) — status: ${c.status}, canal: ${c.channel}`)
      : ["- Nenhuma campanha configurada."]),
    "",
    "## Enrollments recentes",
    ...(summary.recentEnrollments.length > 0
      ? summary.recentEnrollments.map((e) => `- \`${e.id}\` — campanha \`${e.campaignId}\`, status: ${e.status}${e.currentStepId ? `, etapa atual: ${e.currentStepId}` : ""}`)
      : ["- Nenhum enrollment ainda."]),
    "",
    "## Blockers de configuração",
    ...(summary.blockers.length > 0 ? summary.blockers.map((b) => `- ${b}`) : ["- Nenhum — todas as campanhas autorizadas."]),
    "",
    "## Avisos",
    ...(summary.warnings.length > 0 ? summary.warnings.map((w) => `- ${w}`) : ["- Nenhum."]),
    "",
    "> Nenhuma mensagem real foi enviada, nenhuma IA real foi chamada, nenhum canal externo foi tocado. Foundation v1 — só simulação determinística.",
  ];
  return lines.join("\n") + "\n";
}
