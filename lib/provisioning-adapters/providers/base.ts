/**
 * Base compartilhada dos 14 blueprints de provider — Provisioning Adapters
 * Foundation v1. Existe pra nunca duplicar o boilerplate de
 * `ProvisioningProviderAdapter` (validate/dryRun/rollbackPreview/sanitize/
 * executeReal) entre `providers/*.ts` (CLAUDE.md anti-pattern #2). Cada
 * provider só declara `providerId` + como construir `output`/`steps` de
 * rollback — nunca reimplementa a mecânica de validação ou o bloqueio de
 * `executeReal`.
 */
import { listCapabilitiesForProvider } from "../capabilities";
import { sanitizeAdapterInput, sanitizeAdapterOutput } from "../sanitization";
import { validateAdapterRequest } from "../validation";
import {
  RealProvisioningDisabledError,
  type ProvisioningAdapterCapability,
  type ProvisioningAdapterRequest,
  type ProvisioningAdapterResult,
  type ProvisioningProvider,
  type ProvisioningProviderAdapter,
  type ProvisioningRollbackPreview,
} from "../types";

export type ProvisioningProviderBlueprint = {
  providerId: ProvisioningProvider;
  /** Monta o `output` sanitizável do dry-run pra esta operação — nunca I/O real. */
  buildOutput(request: ProvisioningAdapterRequest, capability: ProvisioningAdapterCapability): Record<string, unknown>;
  /** Descreve (texto) os passos que um rollback real faria — nunca executado. */
  buildRollbackSteps(request: ProvisioningAdapterRequest, capability: ProvisioningAdapterCapability): string[];
};

export function createProvisioningProviderAdapter(blueprint: ProvisioningProviderBlueprint): ProvisioningProviderAdapter {
  const { providerId, buildOutput, buildRollbackSteps } = blueprint;

  function capabilities(): ProvisioningAdapterCapability[] {
    return listCapabilitiesForProvider(providerId);
  }

  function findCapabilityForOperation(operation: string): ProvisioningAdapterCapability | undefined {
    return capabilities().find((c) => c.operation === operation);
  }

  function supports(operation: string): boolean {
    return findCapabilityForOperation(operation) !== undefined;
  }

  function validate(request: ProvisioningAdapterRequest): { valid: boolean; errors: string[] } {
    const base = validateAdapterRequest(request);
    const errors = [...base.errors];
    if (request.provider !== providerId) errors.push(`request.provider "${request.provider}" não confere com o adapter "${providerId}"`);
    if (request.provider === providerId && !supports(request.operation)) {
      errors.push(`operação "${request.operation}" não é suportada pelo adapter "${providerId}"`);
    }
    return { valid: errors.length === 0, errors };
  }

  function rollbackPreview(request: ProvisioningAdapterRequest): ProvisioningRollbackPreview {
    const capability = findCapabilityForOperation(request.operation);
    const reversible = Boolean(capability?.supportsRollbackPreview);
    return {
      provider: providerId,
      operation: request.operation,
      reversible,
      steps: reversible ? buildRollbackSteps(request, capability!) : [],
      warnings: reversible ? [] : [`"${providerId}.${request.operation}" não tem rollback automático sugerido nesta Foundation`],
    };
  }

  async function dryRun(request: ProvisioningAdapterRequest): Promise<ProvisioningAdapterResult> {
    const { valid, errors } = validate(request);
    const completedAt = new Date().toISOString();

    if (!valid) {
      return {
        requestId: crypto.randomUUID(),
        provider: providerId,
        operation: request.operation,
        status: "blocked",
        output: {},
        blockers: errors,
        warnings: [],
        rollbackAvailable: false,
        completedAt,
      };
    }

    const capability = findCapabilityForOperation(request.operation)!;

    // Sentinela só usado por `simulation.ts` (cenário `failed-step`) — nunca
    // setado por `mapper.ts` num request real. Mesmo espírito do
    // `failSteps` configurável de `InMemoryProvisioningAdapter`
    // (`lib/provisioning/executor.ts`): permite um cenário de falha
    // determinístico sem inventar I/O.
    if (request.input.__simulateFailure === true) {
      return {
        requestId: crypto.randomUUID(),
        provider: providerId,
        operation: request.operation,
        status: "failed",
        output: {},
        blockers: [`falha simulada em "${providerId}.${request.operation}" — cenário de teste`],
        warnings: [],
        rollbackAvailable: false,
        completedAt,
      };
    }

    const output = sanitizeAdapterOutput(buildOutput(request, capability));
    const preview = capability.supportsRollbackPreview ? rollbackPreview(request) : undefined;

    return {
      requestId: crypto.randomUUID(),
      provider: providerId,
      operation: request.operation,
      status: request.mode === "simulation" ? "simulated" : "ready",
      output,
      blockers: [],
      warnings: [],
      rollbackAvailable: capability.supportsRollbackPreview,
      rollbackPreview: preview,
      completedAt,
    };
  }

  async function executeReal(request: ProvisioningAdapterRequest): Promise<ProvisioningAdapterResult> {
    throw new RealProvisioningDisabledError(providerId, request.operation);
  }

  return {
    providerId,
    capabilities,
    supports,
    validate,
    dryRun,
    rollbackPreview,
    sanitizeInput: sanitizeAdapterInput,
    sanitizeOutput: sanitizeAdapterOutput,
    executeReal,
  };
}

export type ProvisioningOperationDetails = {
  message: string;
  rollback: string[];
  /** Campos extra sintéticos do dry-run — nunca segredo, nunca I/O real. */
  extra?: Record<string, unknown>;
};

/**
 * Variante tabelada de `createProvisioningProviderAdapter` — cada operação
 * só declara mensagem/rollback/campos extra num objeto plano, sem repetir
 * `switch`/boilerplate em cada `providers/*.ts` (mesma etapa de cada
 * capability já vive em `capabilities.ts`; este mapa só acrescenta o texto
 * de simulação).
 */
export function createTableDrivenProvisioningProviderAdapter(
  providerId: ProvisioningProvider,
  operationDetails: Record<string, ProvisioningOperationDetails>,
): ProvisioningProviderAdapter {
  return createProvisioningProviderAdapter({
    providerId,
    buildOutput: (request) => {
      const details = operationDetails[request.operation];
      return { message: details?.message ?? `"${providerId}.${request.operation}" — sem detalhe adicional nesta Foundation`, ...(details?.extra ?? {}) };
    },
    buildRollbackSteps: (request) => operationDetails[request.operation]?.rollback ?? [],
  });
}
