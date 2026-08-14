/**
 * Integração com Control Plane Persistence — registra o ciclo de vida de
 * uma operação real do Supabase (`requested`/`started`/`completed`/`failed`/
 * `blocked`) via `recordOperationEvent` (`../../control-plane-persistence/services.ts`,
 * o único lugar que já grava tanto `control_plane_operation_events` quanto
 * `api_audit_log` numa chamada só). NUNCA registra credencial — só provider,
 * operação, instalação, tenant, status, correlation id, timestamps e código
 * de erro já sanitizado (nome da classe do erro, nunca a mensagem/corpo
 * bruto).
 */
import { recordOperationEvent, type ControlPlaneActorContext } from "@/lib/control-plane-persistence/services";
import type { ControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";
import type { OperationEventSeverity } from "@/lib/control-plane-persistence/types";

import type { SupabaseRealOperation } from "./supabase-real-operations";

export type SupabaseRealOperationEventPhase = "requested" | "started" | "completed" | "failed" | "blocked";

const PHASE_EVENT_TYPE: Record<SupabaseRealOperationEventPhase, string> = {
  requested: "provider_operation.requested",
  started: "provider_operation.started",
  completed: "provider_operation.completed",
  failed: "provider_operation.failed",
  blocked: "provider_operation.blocked",
};

const PHASE_SEVERITY: Record<SupabaseRealOperationEventPhase, OperationEventSeverity> = {
  requested: "info",
  started: "info",
  completed: "success",
  failed: "error",
  blocked: "warning",
};

const PHASE_MESSAGE: Record<SupabaseRealOperationEventPhase, (operation: string) => string> = {
  requested: (op) => `Operação "supabase.${op}" solicitada.`,
  started: (op) => `Operação "supabase.${op}" iniciada.`,
  completed: (op) => `Operação "supabase.${op}" concluída.`,
  failed: (op) => `Operação "supabase.${op}" falhou.`,
  blocked: (op) => `Operação "supabase.${op}" bloqueada.`,
};

export async function recordSupabaseRealOperationEvent(
  repos: ControlPlaneRepositories,
  params: {
    phase: SupabaseRealOperationEventPhase;
    installationId: string;
    tenantId: string;
    operation: SupabaseRealOperation;
    correlationId: string;
    /** Nome de classe de erro (ex.: "SupabaseRateLimitError") — nunca mensagem bruta/body. */
    errorCode?: string;
  },
  ctx: ControlPlaneActorContext = {},
): Promise<void> {
  await recordOperationEvent(
    repos,
    {
      installationId: params.installationId,
      tenantId: params.tenantId,
      eventType: PHASE_EVENT_TYPE[params.phase],
      severity: PHASE_SEVERITY[params.phase],
      message: PHASE_MESSAGE[params.phase](params.operation),
      metadata: {
        provider: "supabase",
        operation: params.operation,
        correlation_id: params.correlationId,
        ...(params.errorCode ? { error_code: params.errorCode } : {}),
      },
    },
    ctx,
  );
}
