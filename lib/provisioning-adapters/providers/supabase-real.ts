/**
 * Real Supabase Adapter — primeiro provider real da Brighter Provisioning
 * Adapters. Traduz as 8 operações do catálogo (`supabase-real-operations.ts`)
 * em chamadas de VERDADE à Supabase Management API — mas SÓ quando:
 *
 *   1. `REAL_PROVISIONING_ENABLED=true` (gate, default `false` — `supabase-real-gate.ts`);
 *   2. a operação está classificada `real_supported` (`project.validate`/
 *      `project.read`/`project.status` nesta etapa — `project.create` fica
 *      `dry_run_only` mesmo com o gate ligado, e as 4 de configuração ficam
 *      `planned`);
 *   3. a credencial resolve via `withProviderCredential()` — NUNCA lida
 *      diretamente por este módulo (boundary de `provider-credentials-runtime`).
 *
 * Dry-run (`dryRunSupabaseRealOperation`) NUNCA toca rede, NUNCA resolve
 * credencial — funciona com o gate desligado e sem nenhuma env configurada.
 * `output` sempre passa por `sanitizeDeep` antes de sair.
 *
 * NÃO é registrado em `createDefaultProvisioningAdapterRegistry()`
 * (`./index.ts`) — esse registry default precisa continuar seguro de
 * importar de qualquer lugar sem tocar `process.env`/rede (ver
 * `../index.ts`). Quem quiser este adapter monta a própria instância via
 * `createRealSupabaseProvisioningAdapter(deps)`, mesma doutrina de "nunca
 * singleton global" de `registry.ts`.
 */
import { randomUUID } from "node:crypto";

import { sanitizeDeep } from "@/lib/tenants/export";
import type { ControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";
import type { ControlPlaneActorContext } from "@/lib/control-plane-persistence/services";
import { withProviderCredential, type WithProviderCredentialDeps } from "@/lib/provider-credentials-runtime/runtime";
import type { ProviderCredentialRequest } from "@/lib/provider-credentials-runtime/types";

import type {
  ProvisioningAdapterCapability,
  ProvisioningAdapterRequest,
  ProvisioningAdapterResult,
  ProvisioningProviderAdapter,
  ProvisioningRollbackPreview,
} from "../types";

import { getProject, listProjects, type SupabaseApiProject } from "./supabase-api";
import { SupabaseManagementClient } from "./supabase-client";
import { SupabaseOperationNotRealSupportedError, SupabaseRequestInvalidError } from "./supabase-errors";
import { assertRealProvisioningEnabled, isRealProvisioningEnabled, RealProvisioningDisabledError } from "./supabase-real-gate";
import { recordSupabaseRealOperationEvent } from "./supabase-real-control-plane";
import { buildSupabaseRealIdempotencyKey } from "./supabase-real-idempotency";
import {
  findSupabaseRealOperation,
  isSupabaseRealOperation,
  SUPABASE_REAL_OPERATION_CATALOG,
  type SupabaseRealOperationCatalogEntry,
} from "./supabase-real-operations";
import { buildSupabaseRealRollbackPreview } from "./supabase-real-rollback";
import { DEFAULT_SUPABASE_RETRY_POLICY, withSupabaseRetry, type SupabaseRetryPolicy } from "./supabase-real-retry";
import { buildSupabaseDryRunOutput, mapSupabaseProjectToOutput } from "./supabase-mapper";
import type { SupabaseRealAdapterRequest, SupabaseRealOperationResult } from "./supabase-real-types";
import { findMissingSupabaseRealInputFields, validateSupabaseRealRequest } from "./supabase-validation";

export * from "./supabase-real-operations";
export * from "./supabase-real-types";
export * from "./supabase-errors";
export { isRealProvisioningEnabled, assertRealProvisioningEnabled, RealProvisioningDisabledError };
export { buildSupabaseRealIdempotencyKey } from "./supabase-real-idempotency";
export { buildSupabaseRealRollbackPreview } from "./supabase-real-rollback";
export { DEFAULT_SUPABASE_RETRY_POLICY } from "./supabase-real-retry";
export { SupabaseManagementClient } from "./supabase-client";

// ---------------------------------------------------------------------------
// Dry-run — nunca I/O, nunca resolve credencial.
// ---------------------------------------------------------------------------

export function dryRunSupabaseRealOperation(request: SupabaseRealAdapterRequest): SupabaseRealOperationResult {
  const requestId = randomUUID();
  const completedAt = new Date().toISOString();
  const structural = validateSupabaseRealRequest(request);

  const idempotencyKey = buildSupabaseRealIdempotencyKey({
    tenantId: request.tenantId,
    installationId: request.installationId,
    operation: request.operation,
    input: request.input,
  });

  if (!structural.valid) {
    return {
      requestId,
      operation: request.operation,
      classification: "planned",
      mode: "dry_run",
      status: "blocked",
      output: {},
      blockers: structural.errors,
      warnings: [],
      rollbackAvailable: false,
      idempotencyKey,
      attempts: 0,
      completedAt,
    };
  }

  const catalogEntry = findSupabaseRealOperation(request.operation)!;
  const missingInputFields = findMissingSupabaseRealInputFields(request);
  const rollbackPreview = catalogEntry.supportsRollbackPreview ? buildSupabaseRealRollbackPreview(catalogEntry.operation) : undefined;

  return {
    requestId,
    operation: catalogEntry.operation,
    classification: catalogEntry.classification,
    mode: "dry_run",
    status: missingInputFields.length > 0 ? "blocked" : "simulated",
    output: buildSupabaseDryRunOutput({ request, catalogEntry, missingInputFields }),
    blockers: missingInputFields.map((f) => `campo obrigatório ausente: "${f}"`),
    warnings: isRealProvisioningEnabled()
      ? []
      : [`REAL_PROVISIONING_ENABLED=false — mesmo "${catalogEntry.operation}" sendo real_supported, executeReal() vai bloquear`],
    rollbackAvailable: catalogEntry.supportsRollbackPreview,
    rollbackPreview,
    idempotencyKey,
    attempts: 0,
    completedAt,
  };
}

// ---------------------------------------------------------------------------
// Execução real — gated.
// ---------------------------------------------------------------------------

export type SupabaseRealExecutionDeps = {
  controlPlaneRepos: ControlPlaneRepositories;
  providerCredentialDeps: WithProviderCredentialDeps;
  actorContext?: ControlPlaneActorContext;
  client?: SupabaseManagementClient;
  retryPolicy?: SupabaseRetryPolicy;
  sleep?: (ms: number) => Promise<void>;
};

async function blockedAndThrow(
  deps: SupabaseRealExecutionDeps,
  request: SupabaseRealAdapterRequest,
  errorCode: string,
  error: Error,
): Promise<never> {
  await recordSupabaseRealOperationEvent(
    deps.controlPlaneRepos,
    {
      phase: "blocked",
      installationId: request.installationId,
      tenantId: request.tenantId,
      operation: request.operation,
      correlationId: request.correlationId,
      errorCode,
    },
    deps.actorContext,
  );
  throw error;
}

export async function executeRealSupabaseOperation(
  deps: SupabaseRealExecutionDeps,
  request: SupabaseRealAdapterRequest,
): Promise<SupabaseRealOperationResult> {
  const requestId = randomUUID();
  const client = deps.client ?? new SupabaseManagementClient();
  const retryPolicy = deps.retryPolicy ?? DEFAULT_SUPABASE_RETRY_POLICY;

  const structural = validateSupabaseRealRequest(request);
  if (!structural.valid) throw new SupabaseRequestInvalidError(structural.errors);

  const idempotencyKey = buildSupabaseRealIdempotencyKey({
    tenantId: request.tenantId,
    installationId: request.installationId,
    operation: request.operation,
    input: request.input,
  });

  if (!isRealProvisioningEnabled()) {
    await blockedAndThrow(
      deps,
      request,
      "RealProvisioningDisabledError",
      new RealProvisioningDisabledError("supabase", request.operation),
    );
  }

  const catalogEntry = findSupabaseRealOperation(request.operation) as SupabaseRealOperationCatalogEntry;
  if (catalogEntry.classification !== "real_supported") {
    await blockedAndThrow(
      deps,
      request,
      "SupabaseOperationNotRealSupportedError",
      new SupabaseOperationNotRealSupportedError(catalogEntry.operation, catalogEntry.classification),
    );
  }

  const missingInputFields = findMissingSupabaseRealInputFields(request);
  if (missingInputFields.length > 0) {
    await blockedAndThrow(
      deps,
      request,
      "SupabaseRequestInvalidError",
      new SupabaseRequestInvalidError(missingInputFields.map((f) => `campo obrigatório ausente: "${f}"`)),
    );
  }

  await recordSupabaseRealOperationEvent(
    deps.controlPlaneRepos,
    {
      phase: "requested",
      installationId: request.installationId,
      tenantId: request.tenantId,
      operation: request.operation,
      correlationId: request.correlationId,
    },
    deps.actorContext,
  );

  const connection = await deps.controlPlaneRepos.providerConnections.findConnection(request.installationId, "supabase");

  const credentialRequest: ProviderCredentialRequest = {
    tenantId: request.tenantId,
    installationId: request.installationId,
    provider: "supabase",
    // Ausência de conexão/secretReferenceId vira um id inexistente de
    // propósito — `withProviderCredential` já nega fail-closed
    // (`secret_reference_not_found`) sem este módulo duplicar essa checagem.
    secretReferenceId: connection?.secretReferenceId ?? "missing",
    purpose: catalogEntry.requiredCredentialPurpose,
    operation: request.operation,
    requestedBy: request.requestedBy ?? null,
    requestedAt: request.requestedAt,
    correlationId: request.correlationId,
    singleUse: true,
  };

  await recordSupabaseRealOperationEvent(
    deps.controlPlaneRepos,
    {
      phase: "started",
      installationId: request.installationId,
      tenantId: request.tenantId,
      operation: request.operation,
      correlationId: request.correlationId,
    },
    deps.actorContext,
  );

  let attempts = 0;

  try {
    const project = await withProviderCredential(deps.providerCredentialDeps, credentialRequest, async (credential) => {
      // `ResolvedCredential.use()` é single-use (`singleUse: true` acima) —
      // marca consumido na PRIMEIRA chamada, mesmo que o callback ainda não
      // tenha terminado. Chamar `.use()` de novo a cada tentativa de retry
      // lançaria `CredentialAlreadyConsumedError` no 2º attempt. Por isso o
      // token é extraído UMA VEZ aqui (ainda dentro do boundary de
      // `withProviderCredential`, nunca retornado por este callback) e
      // reusado por todas as tentativas de `withSupabaseRetry`.
      const token = credential.use((value) => value);

      const callSupabase = async (): Promise<SupabaseApiProject> => {
        if (catalogEntry.operation === "project.validate") {
          const projectRef = typeof request.input.projectRef === "string" ? request.input.projectRef : undefined;
          if (projectRef) return getProject(client, token, projectRef, request.correlationId);
          const projects = await listProjects(client, token, request.correlationId);
          return { id: "validated", status: "token_valid", __projectCount: projects.length } as SupabaseApiProject & {
            __projectCount: number;
          };
        }
        const projectRef = request.input.projectRef as string;
        return getProject(client, token, projectRef, request.correlationId);
      };

      const outcome = await withSupabaseRetry(callSupabase, retryPolicy, deps.sleep);
      attempts = outcome.attempts;
      return outcome.result;
    });

    const result: SupabaseRealOperationResult = {
      requestId,
      operation: catalogEntry.operation,
      classification: catalogEntry.classification,
      mode: "real",
      status: "ready",
      output: mapSupabaseProjectToOutput(project),
      blockers: [],
      warnings: [],
      rollbackAvailable: false,
      idempotencyKey,
      attempts,
      completedAt: new Date().toISOString(),
    };

    await recordSupabaseRealOperationEvent(
      deps.controlPlaneRepos,
      {
        phase: "completed",
        installationId: request.installationId,
        tenantId: request.tenantId,
        operation: request.operation,
        correlationId: request.correlationId,
      },
      deps.actorContext,
    );

    return result;
  } catch (error) {
    const errorCode = error instanceof Error ? error.name : "UnknownError";
    await recordSupabaseRealOperationEvent(
      deps.controlPlaneRepos,
      {
        phase: "failed",
        installationId: request.installationId,
        tenantId: request.tenantId,
        operation: request.operation,
        correlationId: request.correlationId,
        errorCode,
      },
      deps.actorContext,
    );
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Ponte pra `ProvisioningProviderAdapter` (`../types.ts`) — reuso do
// contrato já existente, sem duplicar `validate`/`sanitizeInput`/`sanitizeOutput`
// (ambos delegam pra `../validation.ts`/`../sanitization.ts`, as MESMAS
// funções que o blueprint dry-run usa). `dryRun` chama a versão real deste
// módulo; `executeReal` só chama `executeRealSupabaseOperation` — nunca
// hardcoded pra lançar (diferente do blueprint, que sempre lança).
// ---------------------------------------------------------------------------

function toProvisioningAdapterRequest(request: ProvisioningAdapterRequest): SupabaseRealAdapterRequest | null {
  if (!isSupabaseRealOperation(request.operation)) return null;
  return {
    installationId: request.installationId,
    tenantId: request.tenantId,
    operation: request.operation,
    input: request.input,
    correlationId: request.idempotencyKey,
    requestedAt: request.requestedAt,
  };
}

function toProvisioningAdapterResult(result: SupabaseRealOperationResult): ProvisioningAdapterResult {
  return {
    requestId: result.requestId,
    provider: "supabase",
    operation: result.operation,
    status: result.status,
    output: sanitizeDeep(result.output) as Record<string, unknown>,
    blockers: result.blockers,
    warnings: result.warnings,
    rollbackAvailable: result.rollbackAvailable,
    rollbackPreview: result.rollbackPreview
      ? {
          provider: "supabase",
          operation: result.operation,
          reversible: result.rollbackPreview.reversible,
          steps: result.rollbackPreview.steps,
          warnings: result.rollbackPreview.warnings,
        }
      : undefined,
    completedAt: result.completedAt,
  };
}

export function createRealSupabaseProvisioningAdapter(deps: SupabaseRealExecutionDeps): ProvisioningProviderAdapter {
  function capabilities(): ProvisioningAdapterCapability[] {
    return SUPABASE_REAL_OPERATION_CATALOG.map((entry) => ({
      id: `supabase.${entry.operation}`,
      provider: "supabase",
      operation: entry.operation,
      description: entry.description,
      supportedPlans: ["lite", "pro", "dedicated"],
      requiredCredentialPurpose: entry.requiredCredentialPurpose,
      requiredSecretType: entry.requiredSecretType,
      supportsDryRun: true,
      supportsRollbackPreview: entry.supportsRollbackPreview,
      // Só true pras 3 operações real_supported — mesmo assim, `executeReal`
      // segue exigindo o gate ligado em runtime (isto é só metadado).
      realExecutionAvailable: entry.classification === "real_supported",
    }));
  }

  function supports(operation: string): boolean {
    return isSupabaseRealOperation(operation);
  }

  function validate(request: ProvisioningAdapterRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (request.provider !== "supabase") errors.push(`request.provider "${request.provider}" não confere com o adapter "supabase"`);
    if (!supports(request.operation)) errors.push(`operação "${request.operation}" não é suportada pelo Real Supabase Adapter`);
    return { valid: errors.length === 0, errors };
  }

  async function dryRun(request: ProvisioningAdapterRequest): Promise<ProvisioningAdapterResult> {
    const mapped = toProvisioningAdapterRequest(request);
    if (!mapped) {
      return {
        requestId: randomUUID(),
        provider: "supabase",
        operation: request.operation,
        status: "blocked",
        output: {},
        blockers: [`operação "${request.operation}" não é suportada pelo Real Supabase Adapter`],
        warnings: [],
        rollbackAvailable: false,
        completedAt: new Date().toISOString(),
      };
    }
    return toProvisioningAdapterResult(dryRunSupabaseRealOperation(mapped));
  }

  function rollbackPreview(request: ProvisioningAdapterRequest): ProvisioningRollbackPreview {
    const entry = findSupabaseRealOperation(request.operation);
    const reversible = Boolean(entry?.supportsRollbackPreview);
    const preview = reversible && entry ? buildSupabaseRealRollbackPreview(entry.operation) : undefined;
    return {
      provider: "supabase",
      operation: request.operation,
      reversible,
      steps: preview?.steps ?? [],
      warnings: preview?.warnings ?? [`"supabase.${request.operation}" não tem rollback automático sugerido`],
    };
  }

  async function executeReal(request: ProvisioningAdapterRequest): Promise<ProvisioningAdapterResult> {
    const mapped = toProvisioningAdapterRequest(request);
    if (!mapped) throw new SupabaseRequestInvalidError([`operação "${request.operation}" não é suportada pelo Real Supabase Adapter`]);
    const result = await executeRealSupabaseOperation(deps, mapped);
    return toProvisioningAdapterResult(result);
  }

  return {
    providerId: "supabase",
    capabilities,
    supports,
    validate,
    dryRun,
    rollbackPreview,
    sanitizeInput: (input) => sanitizeDeep(input) as Record<string, unknown>,
    sanitizeOutput: (output) => sanitizeDeep(output) as Record<string, unknown>,
    executeReal,
  };
}
