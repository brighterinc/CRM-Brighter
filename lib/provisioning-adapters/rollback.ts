/**
 * `generateProvisioningRollbackPreview` — Provisioning Adapters Foundation v1.
 *
 * NUNCA executa rollback nenhum: só lista, em ordem inversa, os desfechos
 * de `executeProvisioningDryRun` que chegaram a um resultado pronto/simulado,
 * com o rollback teórico já embutido no `ProvisioningAdapterResult` de cada
 * provider (`providers/*.ts` via `providers/base.ts::rollbackPreview`).
 * Mesmo espírito de `lib/provisioning/rollback.ts::buildRollbackPlan`, um
 * nível abaixo (por provider, não por etapa abstrata).
 */
import type { ProvisioningAdapterStepOutcome } from "./executor";
import { READY_ADAPTER_RESULT_STATUSES } from "./status";
import type { ProvisioningProvider } from "./types";

export type ProvisioningAdapterRollbackEntry = {
  stepId: string;
  provider: ProvisioningProvider;
  operation: string;
  reversible: boolean;
  steps: string[];
  warnings: string[];
};

export function generateProvisioningRollbackPreview(
  outcomes: ProvisioningAdapterStepOutcome[],
): ProvisioningAdapterRollbackEntry[] {
  const readyOutcomes = outcomes.filter(
    (o) => o.result && (READY_ADAPTER_RESULT_STATUSES as string[]).includes(o.result.status),
  );

  return [...readyOutcomes].reverse().map((o) => {
    const result = o.result!;
    return {
      stepId: o.stepId,
      provider: result.provider,
      operation: result.operation,
      reversible: result.rollbackAvailable,
      steps: result.rollbackPreview?.steps ?? [],
      warnings: result.rollbackPreview?.warnings ?? (result.rollbackAvailable ? [] : [`"${result.provider}.${result.operation}" não tem rollback automático sugerido`]),
    };
  });
}
