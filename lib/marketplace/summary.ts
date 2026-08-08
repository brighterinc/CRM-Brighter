/**
 * Resumo operacional — spec §21. JSON (o tipo `MarketplaceSummary` em si) e
 * Markdown (`renderMarketplaceSummaryMarkdown`), mesmo padrão de
 * `generateOutreachSummary`/`generateBillingOperationalSummary`.
 */
import type { Installation } from "@/lib/control-plane/types";

import type {
  DeploymentPlan,
  MarketplaceBundle,
  MarketplaceEntitlementsResult,
  MarketplaceModuleDefinition,
  ModuleLicense,
  ModuleTrial,
} from "./types";

export type GenerateMarketplaceSummaryInput = {
  installation: Installation;
  catalog: MarketplaceModuleDefinition[];
  licenses: ModuleLicense[];
  trials: ModuleTrial[];
  entitlements: MarketplaceEntitlementsResult;
  bundles?: MarketplaceBundle[];
  extraBlockers?: string[];
  extraWarnings?: string[];
};

export type MarketplaceSummary = {
  installationId: string;
  slug: string;
  company: string;
  planId: DeploymentPlan;
  availableModulesCount: number;
  includedModules: string[];
  addonModules: string[];
  activeLicenses: number;
  activeTrials: number;
  expiredModules: string[];
  suspendedModules: string[];
  bundlesCount: number;
  incompatibilities: string[];
  dependencies: string[];
  versions: Record<string, string>;
  billingStatus: "ok" | "attention_needed";
  activationReadiness: "ready" | "blocked";
  blockers: string[];
  warnings: string[];
  nextAction: string;
};

export function generateMarketplaceSummary(input: GenerateMarketplaceSummaryInput): MarketplaceSummary {
  const { installation, catalog, licenses, trials, entitlements } = input;

  const incompatibilities = catalog
    .filter((m) => (m.incompatibleModules ?? []).length > 0)
    .map((m) => `"${m.moduleId}" incompatível com: ${(m.incompatibleModules ?? []).join(", ")}`);

  const dependencies = catalog
    .filter((m) => m.requiredModules.length > 0)
    .map((m) => `"${m.moduleId}" depende de: ${m.requiredModules.join(", ")}`);

  const versions: Record<string, string> = Object.fromEntries(catalog.map((m) => [m.moduleId, m.version]));

  const activeTrials = trials.filter((t) => t.status === "active").length;
  const blockers = [...entitlements.blockers, ...(input.extraBlockers ?? [])];
  const warnings = [...entitlements.warnings, ...(input.extraWarnings ?? [])];

  const billingStatus: MarketplaceSummary["billingStatus"] = entitlements.blockers.some((b) => b.toLowerCase().includes("billing")) ? "attention_needed" : "ok";

  let nextAction = "nenhuma ação necessária";
  if (entitlements.suspendedModules.length > 0) nextAction = "regularizar assinatura para restaurar módulo(s) suspenso(s)";
  else if (entitlements.expiredModules.length > 0) nextAction = "renovar licença(s) expirada(s)";
  else if (blockers.length > 0) nextAction = "revisar bloqueios de elegibilidade/ativação";

  return {
    installationId: installation.id,
    slug: installation.slug,
    company: installation.company,
    planId: installation.deploymentPlan,
    availableModulesCount: catalog.filter((m) => m.enabled).length,
    includedModules: entitlements.includedModules,
    addonModules: entitlements.addonModules,
    activeLicenses: licenses.filter((l) => l.status === "active" || l.status === "grace_period").length,
    activeTrials,
    expiredModules: entitlements.expiredModules,
    suspendedModules: entitlements.suspendedModules,
    bundlesCount: (input.bundles ?? []).length,
    incompatibilities,
    dependencies,
    versions,
    billingStatus,
    activationReadiness: blockers.length === 0 ? "ready" : "blocked",
    blockers,
    warnings,
    nextAction,
  };
}

export function renderMarketplaceSummaryMarkdown(summary: MarketplaceSummary): string {
  const lines: string[] = [];
  lines.push(`# Marketplace — ${summary.company}`);
  lines.push("");
  lines.push(`- Instalação: \`${summary.installationId}\` (${summary.slug})`);
  lines.push(`- Plano: **${summary.planId}**`);
  lines.push(`- Módulos disponíveis no catálogo: ${summary.availableModulesCount}`);
  lines.push(`- Incluídos: ${summary.includedModules.join(", ") || "—"}`);
  lines.push(`- Addons: ${summary.addonModules.join(", ") || "—"}`);
  lines.push(`- Licenças ativas: ${summary.activeLicenses}`);
  lines.push(`- Trials ativos: ${summary.activeTrials}`);
  lines.push(`- Expirados: ${summary.expiredModules.join(", ") || "—"}`);
  lines.push(`- Suspensos: ${summary.suspendedModules.join(", ") || "—"}`);
  lines.push(`- Bundles: ${summary.bundlesCount}`);
  lines.push(`- Billing: ${summary.billingStatus}`);
  lines.push(`- Prontidão de ativação: **${summary.activationReadiness}**`);
  lines.push("");

  if (summary.incompatibilities.length > 0) {
    lines.push("## Incompatibilidades");
    for (const i of summary.incompatibilities) lines.push(`- ${i}`);
    lines.push("");
  }

  if (summary.dependencies.length > 0) {
    lines.push("## Dependências comerciais");
    for (const d of summary.dependencies) lines.push(`- ${d}`);
    lines.push("");
  }

  if (summary.blockers.length > 0) {
    lines.push("## Blockers");
    for (const b of summary.blockers) lines.push(`- ${b}`);
    lines.push("");
  }

  if (summary.warnings.length > 0) {
    lines.push("## Warnings");
    for (const w of summary.warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push(`## Próxima ação`);
  lines.push(summary.nextAction);
  lines.push("");

  return lines.join("\n");
}
