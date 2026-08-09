/**
 * Integrações da Provisioning Adapters Foundation com as fundações irmãs —
 * v1. Cada fundação PRECEDENTE só é CONSUMIDA (nunca duplicada nem
 * modificada): Provisioning Engine recebe um view model de cobertura
 * (nunca um `ProvisioningPlan` real modificado — mesmo sentido único que
 * `lib/marketplace/integrations.ts` já usa pro Provisioning); Marketplace é
 * consumido via `ModuleActivationPlan`/`lib/modules/catalog.ts` (nunca
 * reimplementa a resolução de infra do Module Engine); Control Plane recebe
 * um resumo anexado (nunca se registra de volta nela).
 */
import { getModuleDefinition } from "@/lib/modules/catalog";
import type { Installation } from "@/lib/control-plane/types";
import type { ProvisioningPlan } from "@/lib/provisioning";

import { PROVISIONING_ADAPTER_CAPABILITY_CATALOG } from "./capabilities";
import type { ProvisioningAdapterRegistry } from "./registry";
import type { ProvisioningAdapterSummary } from "./summary";
import type { ProvisioningProvider } from "./types";

// ---------------------------------------------------------------------------
// Provisioning Engine — view model de cobertura (nunca escreve no ProvisioningPlan)
// ---------------------------------------------------------------------------

export type ProvisioningPlanAdapterStatus = "resolved" | "unmapped" | "missing_adapter" | "missing_capability" | "incompatible_plan";

export type ProvisioningPlanAdapterStepView = {
  stepId: string;
  provider: ProvisioningProvider | null;
  operation: string | null;
  capabilityId: string | null;
  adapterStatus: ProvisioningPlanAdapterStatus;
  dryRunReady: boolean;
  rollbackSupported: boolean;
  blockers: string[];
  warnings: string[];
};

export type ProvisioningPlanAdapterAttachment = {
  provisioningPlanId: string;
  steps: ProvisioningPlanAdapterStepView[];
  mappedCount: number;
  unmappedCount: number;
  missingAdapterCount: number;
  missingCapabilityCount: number;
};

/** View model só pra REPRESENTAÇÃO — nunca escreve em `ProvisioningPlan` nem chama `dryRun`. */
export function attachAdaptersToProvisioningPlan(
  plan: Pick<ProvisioningPlan, "id" | "steps" | "target">,
  registry: ProvisioningAdapterRegistry,
): ProvisioningPlanAdapterAttachment {
  const steps: ProvisioningPlanAdapterStepView[] = plan.steps.map((stepState) => {
    const resolution = registry.resolveAdapterForStep(stepState.stepId, plan.target);

    if (resolution.status === "unmapped") {
      return {
        stepId: stepState.stepId,
        provider: null,
        operation: null,
        capabilityId: null,
        adapterStatus: "unmapped",
        dryRunReady: false,
        rollbackSupported: false,
        blockers: [],
        warnings: [`etapa "${stepState.stepId}" sem provider nesta Foundation`],
      };
    }
    if (resolution.status === "missing_adapter" || resolution.status === "missing_capability") {
      const label = resolution.status === "missing_adapter" ? `adapter "${resolution.provider}" não registrado` : `adapter "${resolution.provider}" não suporta a operação "${resolution.operation}"`;
      return {
        stepId: stepState.stepId,
        provider: resolution.provider,
        operation: resolution.operation,
        capabilityId: null,
        adapterStatus: resolution.status,
        dryRunReady: false,
        rollbackSupported: false,
        blockers: [label],
        warnings: [],
      };
    }

    const { provider, operation, capability } = resolution;
    return {
      stepId: stepState.stepId,
      provider,
      operation,
      capabilityId: capability.id,
      adapterStatus: "resolved",
      dryRunReady: capability.supportsDryRun,
      rollbackSupported: capability.supportsRollbackPreview,
      blockers: [],
      warnings: [],
    };
  });

  return {
    provisioningPlanId: plan.id,
    steps,
    mappedCount: steps.filter((s) => s.adapterStatus === "resolved").length,
    unmappedCount: steps.filter((s) => s.adapterStatus === "unmapped").length,
    missingAdapterCount: steps.filter((s) => s.adapterStatus === "missing_adapter").length,
    missingCapabilityCount: steps.filter((s) => s.adapterStatus === "missing_capability").length,
  };
}

// ---------------------------------------------------------------------------
// Marketplace — quais providers uma ativação de módulo tocaria (nunca ativa nada)
// ---------------------------------------------------------------------------

/** Formato mínimo consumido de `ModuleActivationPlan` (`lib/marketplace/types.ts`) — nunca duplicado, só um `Pick`. */
export type MarketplaceActivationPlanLike = {
  moduleId: string;
  desiredState: "activated" | "deactivated";
  blockers: string[];
};

export type MarketplaceActivationAdapterTouchpoint = {
  moduleId: string;
  infraFlag: string;
  capabilityId: string;
  provider: ProvisioningProvider;
  operation: string;
};

export type MarketplaceActivationAdaptersView = {
  activationPlanCount: number;
  touchpoints: MarketplaceActivationAdapterTouchpoint[];
  providersInvolved: ProvisioningProvider[];
};

/**
 * Deriva os providers tocados a partir de `ModuleDefinition.requires`
 * (`lib/modules/catalog.ts` — fonte canônica) — nunca faz parsing do texto
 * livre de `ModuleActivationPlan.provisioningSteps`
 * (`lib/marketplace/activation.ts`), que é só rótulo pra humano, não um id
 * estável.
 */
export function attachMarketplaceActivationToAdapters(activationPlans: MarketplaceActivationPlanLike[]): MarketplaceActivationAdaptersView {
  const toActivate = activationPlans.filter((p) => p.desiredState === "activated" && p.blockers.length === 0);
  const touchpoints: MarketplaceActivationAdapterTouchpoint[] = [];

  for (const plan of toActivate) {
    const moduleDefinition = getModuleDefinition(plan.moduleId);
    if (!moduleDefinition) continue;

    const requiredFlags = Object.entries(moduleDefinition.requires)
      .filter(([, required]) => Boolean(required))
      .map(([flag]) => flag);

    for (const flag of requiredFlags) {
      const matchingCapabilities = PROVISIONING_ADAPTER_CAPABILITY_CATALOG.filter((c) => c.requiredInfra?.includes(flag));
      for (const capability of matchingCapabilities) {
        touchpoints.push({ moduleId: plan.moduleId, infraFlag: flag, capabilityId: capability.id, provider: capability.provider, operation: capability.operation });
      }
    }
  }

  return {
    activationPlanCount: toActivate.length,
    touchpoints,
    providersInvolved: Array.from(new Set(touchpoints.map((t) => t.provider))),
  };
}

// ---------------------------------------------------------------------------
// Control Plane — attach (view model combinado, nunca escreve na Installation)
// ---------------------------------------------------------------------------

export type ProvisioningAdapterInstallationOverview = {
  installationId: string;
  slug: string;
  company: string;
  providersRequired: ProvisioningProvider[];
  providersAvailable: ProvisioningProvider[];
  providersMissing: ProvisioningProvider[];
  readiness: "ready" | "partial" | "blocked";
  blockers: string[];
  warnings: string[];
  lastSimulationScenario: string | null;
  rollbackReady: boolean;
  recommendedNextAction: string;
};

export function attachProvisioningAdapterSummaryToInstallationSummary(
  installation: Pick<Installation, "id" | "slug" | "company">,
  summary: ProvisioningAdapterSummary | null,
  registry: ProvisioningAdapterRegistry,
): ProvisioningAdapterInstallationOverview {
  const providersAvailable = registry.listAdapters().map((a) => a.providerId);

  if (!summary) {
    return {
      installationId: installation.id,
      slug: installation.slug,
      company: installation.company,
      providersRequired: [],
      providersAvailable,
      providersMissing: [],
      readiness: "blocked",
      blockers: ["nenhuma simulação de adapters rodada ainda"],
      warnings: [],
      lastSimulationScenario: null,
      rollbackReady: false,
      recommendedNextAction: "Rodar simulação de adapters (CLI `pnpm provisioning:adapters`)",
    };
  }

  const providersRequired = summary.providerCoverage.map((p) => p.provider);
  const providersMissing = providersRequired.filter((p) => !providersAvailable.includes(p));

  const readiness: ProvisioningAdapterInstallationOverview["readiness"] =
    summary.blockedSteps === 0 && summary.failedSteps === 0 && summary.blockers.length === 0
      ? "ready"
      : summary.readySteps > 0
        ? "partial"
        : "blocked";

  return {
    installationId: installation.id,
    slug: installation.slug,
    company: installation.company,
    providersRequired,
    providersAvailable,
    providersMissing,
    readiness,
    blockers: summary.blockers,
    warnings: summary.warnings,
    lastSimulationScenario: summary.scenario,
    rollbackReady: summary.rollbackAvailableSteps > 0,
    recommendedNextAction: summary.recommendedNextAction,
  };
}
