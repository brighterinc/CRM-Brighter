/**
 * `executeProvisioningDryRun` — Provisioning Adapters Foundation v1.
 *
 * Roda dry-run por PROVIDER pra cada etapa de um `ProvisioningPlan`
 * (`lib/provisioning/`) — nunca reordena, nunca decide dependência: reusa
 * `getProvisioningStepDefinition().dependsOn` e a ordem já topológica de
 * `plan.steps` (calculada por `lib/provisioning/planner.ts`). Complementa
 * (nunca substitui) `lib/provisioning/executor.ts::executeProvisioningPlan`
 * — aquele roda o `ProvisioningAdapter` genérico do Provisioning Engine;
 * este resolve, por etapa, qual PROVIDER concreto a executaria. Resultados
 * só em memória — nunca persistidos fora do `ProvisioningAdapterRepository`
 * opcional passado pelo chamador.
 */
import { getProvisioningStepDefinition, type ProvisioningPlan } from "@/lib/provisioning";

import { mapProvisioningStepToAdapterRequest, type MapProvisioningStepToAdapterRequestResult } from "./mapper";
import type { ProvisioningAdapterRegistry } from "./registry";
import type { ProvisioningAdapterRepository } from "./repository";
import { READY_ADAPTER_RESULT_STATUSES } from "./status";
import type { ProvisioningAdapterResult } from "./types";

export type ProvisioningAdapterStepOutcome = {
  stepId: string;
  mapping: MapProvisioningStepToAdapterRequestResult;
  result?: ProvisioningAdapterResult;
};

export type ExecuteProvisioningDryRunOptions = {
  installationId: string;
  tenantId: string;
  registry: ProvisioningAdapterRegistry;
  /** Opcional — quando presente, resultados repetidos (mesma `idempotencyKey`) são reusados, nunca regerados. */
  repository?: ProvisioningAdapterRepository;
};

export type ExecuteProvisioningDryRunResult = {
  planId: string;
  outcomes: ProvisioningAdapterStepOutcome[];
};

function dependencyBlockedResult(provider: string, operation: string, blockingDeps: string[]): ProvisioningAdapterResult {
  return {
    requestId: crypto.randomUUID(),
    provider: provider as ProvisioningAdapterResult["provider"],
    operation,
    status: "blocked",
    output: {},
    blockers: [`dependência(s) não concluída(s) no dry-run de adapters: ${blockingDeps.join(", ")}`],
    warnings: [],
    rollbackAvailable: false,
    completedAt: new Date().toISOString(),
  };
}

export async function executeProvisioningDryRun(
  plan: ProvisioningPlan,
  options: ExecuteProvisioningDryRunOptions,
): Promise<ExecuteProvisioningDryRunResult> {
  const outcomes: ProvisioningAdapterStepOutcome[] = [];

  // Mesma regra de `lib/provisioning/executor.ts`: run com blockers globais
  // nunca dispara dry-run de adapter nenhum.
  if (plan.blockers.length > 0) {
    return { planId: plan.id, outcomes };
  }

  const stepIdsInPlan = new Set(plan.steps.map((s) => s.stepId));
  const blockedStepIds = new Set<string>();

  for (const stepState of plan.steps) {
    const stepId = stepState.stepId;
    const definition = getProvisioningStepDefinition(stepId);
    const deps = (definition?.dependsOn ?? []).filter((id) => stepIdsInPlan.has(id));
    const blockingDeps = deps.filter((id) => blockedStepIds.has(id));

    const mapping = mapProvisioningStepToAdapterRequest({
      installationId: options.installationId,
      tenantId: options.tenantId,
      plan: { plan: plan.plan, target: plan.target, manifestFingerprint: plan.manifestFingerprint },
      stepId,
      registry: options.registry,
    });

    // Etapa sem provider nesta Foundation (ex.: validação/handoff) — nunca
    // bloqueia dependentes: não há infra pendente à espera.
    if (mapping.status === "unmapped") {
      outcomes.push({ stepId, mapping });
      continue;
    }

    // Adapter/capability ausente ou plano incompatível — configuração
    // incompleta, propaga bloqueio pros dependentes (a infra é incerta).
    if (mapping.status !== "resolved") {
      blockedStepIds.add(stepId);
      outcomes.push({ stepId, mapping });
      continue;
    }

    if (blockingDeps.length > 0) {
      blockedStepIds.add(stepId);
      const result = dependencyBlockedResult(mapping.request.provider, mapping.request.operation, blockingDeps);
      outcomes.push({ stepId, mapping, result });
      continue;
    }

    const existing = await options.repository?.findByIdempotencyKey(mapping.request.idempotencyKey);
    const adapter = options.registry.findAdapter(mapping.request.provider);
    const result = existing ?? (adapter ? await adapter.dryRun(mapping.request) : undefined);

    if (!result) {
      // Nunca deveria acontecer — `mapping.status === "resolved"` já
      // confirmou que o adapter está registrado. Defesa em profundidade.
      blockedStepIds.add(stepId);
      outcomes.push({ stepId, mapping });
      continue;
    }

    if (!existing && options.repository) {
      await options.repository.saveRequest(mapping.request);
      await options.repository.saveResult(result, mapping.request.idempotencyKey);
    }

    if (!(READY_ADAPTER_RESULT_STATUSES as string[]).includes(result.status)) {
      blockedStepIds.add(stepId);
    }

    outcomes.push({ stepId, mapping, result });
  }

  return { planId: plan.id, outcomes };
}
