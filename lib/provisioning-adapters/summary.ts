/**
 * `generateProvisioningAdapterSummary` — Provisioning Adapters Foundation v1.
 * Função pura que combina um `ProvisioningAdapterSimulationResult`
 * (`simulation.ts`) em algo pronto pra tela/CLI. Sem I/O, sem segredo — todo
 * `output`/`input` que chega aqui já passou por `sanitizeDeep` nos
 * adapters/mapper. Mesma doutrina de `lib/provisioning/summary.ts`.
 */
import type { DeploymentPlan, DeploymentTarget } from "@/lib/deployment";

import { PROVISIONING_PROVIDERS, type ProvisioningProvider } from "./types";
import type { ProvisioningAdapterStepOutcome } from "./executor";
import { READY_ADAPTER_RESULT_STATUSES } from "./status";
import type { ProvisioningAdapterSimulationResult } from "./simulation";

export type ProvisioningAdapterProviderCoverage = {
  provider: ProvisioningProvider;
  stepsCount: number;
  ready: number;
  blocked: number;
};

/**
 * Formato mínimo aceito por `generateProvisioningAdapterSummary` — só
 * afrouxa `scenario` pra `string` (`ProvisioningAdapterSimulationResult`
 * satisfaz por tipagem estrutural). Existe pra reusar esta função tanto nos
 * cenários nomeados de `simulation.ts` quanto no dry-run ao vivo da
 * instalação atual (`app/app/settings/provisioning-adapters/page.tsx`),
 * que não é nenhum cenário nomeado.
 */
export type ProvisioningAdapterSummaryInput = Omit<ProvisioningAdapterSimulationResult, "scenario"> & { scenario: string };

export type ProvisioningAdapterSummary = {
  scenario: string;
  installationId: string;
  slug: string;
  planId: string;
  plan: DeploymentPlan;
  target: DeploymentTarget;
  totalSteps: number;
  mappedSteps: number;
  unmappedSteps: number;
  readySteps: number;
  blockedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  providerCoverage: ProvisioningAdapterProviderCoverage[];
  rollbackAvailableSteps: number;
  rollbackTotalSteps: number;
  blockers: string[];
  warnings: string[];
  generatedAt: string;
  recommendedNextAction: string;
};

function isConfigGap(mapping: ProvisioningAdapterStepOutcome["mapping"]): boolean {
  return mapping.status === "missing_adapter" || mapping.status === "missing_capability" || mapping.status === "incompatible_plan";
}

function providerOf(mapping: ProvisioningAdapterStepOutcome["mapping"]): ProvisioningProvider | null {
  if (mapping.status === "unmapped") return null;
  if (mapping.status === "resolved") return mapping.request.provider;
  return mapping.provider;
}

function isOutcomeReady(outcome: ProvisioningAdapterStepOutcome): boolean {
  return Boolean(outcome.result && (READY_ADAPTER_RESULT_STATUSES as string[]).includes(outcome.result.status));
}

function buildProviderCoverage(outcomes: ProvisioningAdapterStepOutcome[]): ProvisioningAdapterProviderCoverage[] {
  const tally = new Map<ProvisioningProvider, ProvisioningAdapterProviderCoverage>();
  for (const outcome of outcomes) {
    const provider = providerOf(outcome.mapping);
    if (!provider) continue;
    const entry = tally.get(provider) ?? { provider, stepsCount: 0, ready: 0, blocked: 0 };
    entry.stepsCount += 1;
    if (isOutcomeReady(outcome)) entry.ready += 1;
    else entry.blocked += 1;
    tally.set(provider, entry);
  }
  return PROVISIONING_PROVIDERS.filter((p) => tally.has(p)).map((p) => tally.get(p)!);
}

function recommendNextAction(summary: Pick<ProvisioningAdapterSummary, "blockers" | "blockedSteps" | "mappedSteps" | "readySteps">): string {
  if (summary.blockers.length > 0) return `Resolver bloqueio: ${summary.blockers[0]}`;
  if (summary.blockedSteps > 0) return "Registrar ou corrigir adapter/capability para a(s) etapa(s) sem cobertura";
  if (summary.mappedSteps === 0) return "Nenhuma etapa desta instalação tem provider mapeado nesta Foundation";
  if (summary.readySteps === summary.mappedSteps) return "Nenhuma ação necessária — todas as etapas mapeadas estão prontas (dry-run)";
  return "Revisar etapas pendentes";
}

export function generateProvisioningAdapterSummary(result: ProvisioningAdapterSummaryInput): ProvisioningAdapterSummary {
  const { installation, plan, outcomes, rollbackPreview, blockers, warnings } = result;

  const mappedOutcomes = outcomes.filter((o) => o.mapping.status !== "unmapped");
  const unmappedSteps = outcomes.length - mappedOutcomes.length;
  const readySteps = outcomes.filter(isOutcomeReady).length;
  const failedSteps = outcomes.filter((o) => o.result?.status === "failed").length;
  const skippedSteps = outcomes.filter((o) => o.result?.status === "skipped").length;
  const blockedSteps = outcomes.filter((o) => !isOutcomeReady(o) && (isConfigGap(o.mapping) || o.result?.status === "blocked")).length;

  const summary: ProvisioningAdapterSummary = {
    scenario: result.scenario,
    installationId: installation.id,
    slug: installation.slug,
    planId: plan.id,
    plan: plan.plan,
    target: plan.target,
    totalSteps: outcomes.length,
    mappedSteps: mappedOutcomes.length,
    unmappedSteps,
    readySteps,
    blockedSteps,
    failedSteps,
    skippedSteps,
    providerCoverage: buildProviderCoverage(outcomes),
    rollbackAvailableSteps: rollbackPreview.filter((r) => r.reversible).length,
    rollbackTotalSteps: rollbackPreview.length,
    blockers,
    warnings,
    generatedAt: new Date().toISOString(),
    recommendedNextAction: "",
  };
  summary.recommendedNextAction = recommendNextAction(summary);
  return summary;
}

export function renderProvisioningAdapterSummaryMarkdown(summary: ProvisioningAdapterSummary): string {
  const lines: string[] = [
    `# Adaptadores de provisionamento — ${summary.slug}`,
    "",
    `- **Cenário:** ${summary.scenario}`,
    `- **Plano:** ${summary.plan}`,
    `- **Target:** ${summary.target}`,
    `- **Próxima ação recomendada:** ${summary.recommendedNextAction}`,
    "",
    `## Etapas (${summary.totalSteps})`,
    `- Mapeadas (com provider): ${summary.mappedSteps}`,
    `- Sem provider nesta Foundation: ${summary.unmappedSteps}`,
    `- Prontas (dry-run): ${summary.readySteps}`,
    `- Bloqueadas: ${summary.blockedSteps}`,
    `- Falhas: ${summary.failedSteps}`,
    `- Puladas: ${summary.skippedSteps}`,
    "",
    `## Rollback`,
    `- Reversíveis: ${summary.rollbackAvailableSteps} de ${summary.rollbackTotalSteps} etapa(s) com resultado pronto`,
    "",
    `## Cobertura por provider (${summary.providerCoverage.length})`,
    ...summary.providerCoverage.map((p) => `- ${p.provider}: ${p.ready} pronta(s), ${p.blocked} bloqueada(s) (${p.stepsCount} etapa(s))`),
  ];

  if (summary.warnings.length > 0) {
    lines.push("", "## Avisos", ...summary.warnings.map((w) => `- ${w}`));
  }
  if (summary.blockers.length > 0) {
    lines.push("", "## Bloqueios", ...summary.blockers.map((b) => `- ${b}`));
  }

  lines.push("", `_Gerado em ${summary.generatedAt}_`);

  return lines.join("\n") + "\n";
}
