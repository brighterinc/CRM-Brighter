/**
 * Tipos do Real Supabase Adapter — request/result específicos de execução
 * real, separados de `ProvisioningAdapterRequest`/`Result`
 * (`../types.ts`, que não carregam `secretReferenceId`/`correlationId`
 * necessários pra `withProviderCredential()`). O adapter principal
 * (`supabase-real.ts`) faz a ponte pro shape `ProvisioningProviderAdapter`
 * quando exposto via `createRealSupabaseProvisioningAdapter`.
 */
import type { SupabaseRealOperation, SupabaseRealOperationClassification } from "./supabase-real-operations";

export type SupabaseRealAdapterMode = "dry_run" | "real";

export type SupabaseRealAdapterRequest = {
  installationId: string;
  tenantId: string;
  operation: SupabaseRealOperation;
  /** Nunca segredo — já validado por `supabase-validation.ts` antes de qualquer I/O. */
  input: Record<string, unknown>;
  correlationId: string;
  requestedBy?: string | null;
  /** ISO-8601 UTC. */
  requestedAt: string;
};

export type SupabaseRealRollbackPreview = {
  operation: SupabaseRealOperation;
  reversible: boolean;
  requiresHumanApproval: boolean;
  dataLossRisk: boolean;
  steps: string[];
  warnings: string[];
};

export type SupabaseRealOperationResultStatus = "ready" | "blocked" | "failed" | "simulated";

export type SupabaseRealOperationResult = {
  requestId: string;
  operation: SupabaseRealOperation;
  classification: SupabaseRealOperationClassification;
  mode: SupabaseRealAdapterMode;
  status: SupabaseRealOperationResultStatus;
  /** Já sanitizado (`sanitizeDeep`) — nunca segredo. */
  output: Record<string, unknown>;
  blockers: string[];
  warnings: string[];
  rollbackAvailable: boolean;
  rollbackPreview?: SupabaseRealRollbackPreview;
  idempotencyKey: string;
  attempts: number;
  /** ISO-8601 UTC. */
  completedAt: string;
};
