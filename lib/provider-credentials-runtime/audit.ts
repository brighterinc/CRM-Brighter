/**
 * Auditoria da Provider Credentials Runtime — REUSA (nunca duplica) o canal
 * já existente `control_plane_operation_events` via
 * `recordOperationEvent()` (`lib/control-plane-persistence/services.ts`).
 * Novos `eventType` (`PROVIDER_CREDENTIALS_RUNTIME_EVENT_TYPES`) somam ao
 * vocabulário ABERTO já existente — sem migration.
 *
 * `ProviderCredentialAuditSink` é injetado (mesmo padrão de `AuditEmitter`
 * em `services.ts`): quem chama em contexto sem `ControlPlaneRepositories`
 * real (CLI, teste in-memory, simulação) passa um sink próprio
 * (`createNoopAuditSink`/`createInMemoryAuditSink`), nunca precisa importar
 * `@/lib/audit`/`lib/env.ts`. Quem chama com um `ControlPlaneRepositories`
 * de verdade usa `createControlPlaneOperationEventAuditSink`.
 *
 * `assertNoCredentialLeak` roda em TODO metadata antes de sair — nunca
 * `value`/`secret`/`token`/`vault_key` completa chega no evento.
 */
import { recordOperationEvent, type ControlPlaneActorContext } from "@/lib/control-plane-persistence/services";
import type { ControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";
import type { OperationEventSeverity } from "@/lib/control-plane-persistence/types";

import { assertNoCredentialLeak } from "./sanitization";
import type { ProviderCredentialsRuntimeEventType } from "./types";

export type ProviderCredentialAuditEvent = {
  eventType: ProviderCredentialsRuntimeEventType;
  severity: OperationEventSeverity;
  message: string;
  installationId: string | null;
  tenantId: string | null;
  /** Passa por `assertNoCredentialLeak` aqui dentro — nunca segredo, nunca `vaultKey` completa. */
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
};

export type ProviderCredentialAuditSink = (event: ProviderCredentialAuditEvent) => Promise<void>;

export async function recordProviderCredentialAuditEvent(
  sink: ProviderCredentialAuditSink,
  event: ProviderCredentialAuditEvent,
): Promise<void> {
  const metadata = event.metadata ?? {};
  assertNoCredentialLeak(metadata, `recordProviderCredentialAuditEvent.metadata(${event.eventType})`);
  await sink({ ...event, metadata });
}

/** Sink real — grava em `control_plane_operation_events` via a camada de serviço já existente. */
export function createControlPlaneOperationEventAuditSink(
  repos: ControlPlaneRepositories,
  ctx: ControlPlaneActorContext = {},
): ProviderCredentialAuditSink {
  return async (event) => {
    await recordOperationEvent(
      repos,
      {
        installationId: event.installationId,
        tenantId: event.tenantId,
        eventType: event.eventType,
        severity: event.severity,
        message: event.message,
        metadata: event.metadata,
        actorUserId: event.actorUserId ?? ctx.actorUserId ?? null,
      },
      ctx,
    );
  };
}

/** Descarta tudo — pra fluxo estritamente in-memory que não quer nem precisa de `ControlPlaneRepositories`. */
export function createNoopAuditSink(): ProviderCredentialAuditSink {
  return async () => {};
}

/** Acumula em memória — pra teste/CLI que quer inspecionar os eventos emitidos sem repositório real. */
export function createInMemoryAuditSink(): { sink: ProviderCredentialAuditSink; events: ProviderCredentialAuditEvent[] } {
  const events: ProviderCredentialAuditEvent[] = [];
  const sink: ProviderCredentialAuditSink = async (event) => {
    events.push(event);
  };
  return { sink, events };
}
