/**
 * Tipos centrais da Brighter Provider Credentials Runtime — v1.
 *
 * Esta camada NUNCA guarda o valor de um segredo em um campo de tipo — só
 * referências (`secretReferenceId`), decisões de política e metadata de
 * lease. O único lugar que já viu um valor de segredo em runtime é
 * `ResolvedCredential` (abaixo), e mesmo esse objeto não expõe o valor por
 * propriedade enumerável nem serialização — só via `.use(fn)`.
 *
 * Reusa (nunca duplica) o vocabulário e os tipos já existentes da Control
 * Plane Persistence: `SecretReferenceMetadata`, `SecretReferenceType`,
 * `SecretReferenceProvider`, `VaultProvider` (`../control-plane-persistence/types`)
 * e `ProvisioningProvider` (`../provisioning-adapters/types`).
 */
import { randomUUID } from "node:crypto";

import type {
  SecretReferenceMetadata,
  SecretReferenceProvider,
  SecretReferenceType,
  VaultProvider,
} from "@/lib/control-plane-persistence/types";
import type { ProvisioningProvider } from "@/lib/provisioning-adapters/types";

export type {
  SecretReferenceMetadata,
  SecretReferenceProvider,
  SecretReferenceType,
  VaultProvider,
  ProvisioningProvider,
};

// ---------------------------------------------------------------------------
// Vocabulário — TS-only nesta fase (nenhuma tabela persiste nada daqui, ver
// `CONTEXTO` da tarefa — "não aplicar migration"). Fechado por união E por
// array (`as const`), igual ao padrão de `ProvisioningProvider`/`PROVISIONING_PROVIDERS`.
// ---------------------------------------------------------------------------

export const PROVIDER_CREDENTIAL_PURPOSES = [
  "api_call",
  "deploy",
  "database_admin",
  "dns_write",
  "webhook_configuration",
  "messaging",
  "monitoring",
  "billing",
] as const;
export type ProviderCredentialPurpose = (typeof PROVIDER_CREDENTIAL_PURPOSES)[number];

export const PROVIDER_CREDENTIAL_STATUSES = ["active", "unavailable", "expired", "revoked", "invalid", "blocked"] as const;
export type ProviderCredentialStatus = (typeof PROVIDER_CREDENTIAL_STATUSES)[number];

export const CREDENTIAL_LEASE_STATUSES = [
  "created",
  "active",
  "consumed",
  "released",
  "expired",
  "revoked",
  "failed",
] as const;
export type CredentialLeaseStatus = (typeof CREDENTIAL_LEASE_STATUSES)[number];

export const RUNTIME_VAULT_PROVIDER_IDS = ["noop", "in_memory", "environment"] as const;
export type RuntimeVaultProviderId = (typeof RUNTIME_VAULT_PROVIDER_IDS)[number];

/**
 * Vocabulário ABERTO de eventos de audit desta camada — soma-se a
 * `CONTROL_PLANE_OPERATION_EVENT_TYPES` (que também é `readonly string[]`,
 * sem CHECK no banco), nunca precisa de migration pra crescer. Ver `audit.ts`.
 */
export const PROVIDER_CREDENTIALS_RUNTIME_EVENT_TYPES = [
  "credential_access_requested",
  "credential_access_denied",
  "credential_resolved",
  "credential_lease_created",
  "credential_consumed",
  "credential_released",
  "credential_failed",
  "credential_revoked",
] as const;
export type ProviderCredentialsRuntimeEventType = (typeof PROVIDER_CREDENTIALS_RUNTIME_EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Request — nunca recebe segredo bruto, só a referência opaca.
// ---------------------------------------------------------------------------

export type ProviderCredentialRequest = {
  tenantId: string;
  installationId: string;
  provider: ProvisioningProvider;
  secretReferenceId: string;
  purpose: ProviderCredentialPurpose;
  operation: string;
  requestedBy?: string | null;
  /** ISO-8601 UTC. */
  requestedAt: string;
  correlationId: string;
  /** Default `true` — política single-use é o comportamento seguro por padrão. */
  singleUse?: boolean;
};

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export type ProviderCredentialPolicyDecision = {
  allowed: boolean;
  blockers: string[];
  warnings: string[];
  reason: string;
  /** Já seguro pra log/audit — nunca segredo, nunca `vaultKey` completa. */
  auditMetadata: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Lease
// ---------------------------------------------------------------------------

export type CredentialLease = {
  id: string;
  tenantId: string;
  installationId: string;
  provider: ProvisioningProvider;
  secretReferenceId: string;
  purpose: ProviderCredentialPurpose;
  operation: string;
  status: CredentialLeaseStatus;
  singleUse: boolean;
  correlationId: string;
  requestedBy: string | null;
  /** ISO-8601 UTC. */
  createdAt: string;
  activatedAt?: string;
  consumedAt?: string;
  releasedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  failureReason?: string;
};

// ---------------------------------------------------------------------------
// ResolvedCredential — o único objeto que carrega um valor de segredo em
// memória, e só pelo menor intervalo possível. Doutrina:
//   - valor vive num `Buffer` privado real (`#`, nunca `private` do TS —
//     aquilo é só apagado em compile-time, ainda vira propriedade own
//     enumerável em runtime; `#` é privacidade de verdade do motor JS);
//   - sem getter de valor — só `.use(fn)`, que entrega o valor pro callback
//     e IMEDIATAMENTE marca consumo (se single-use);
//   - `toJSON()` e `util.inspect.custom` nunca retornam o valor — mesmo um
//     `console.log(credential)` ou `JSON.stringify({ credential })` de boa-fé
//     não vaza nada;
//   - `.release()` zera o buffer (`fill(0)`) e marca liberado — idempotente;
//   - marcado com um Symbol sentinela não-exportado pra permitir detecção
//     estrutural de "isso é um ResolvedCredential" em `containsResolvedCredential`
//     (usado por `sanitization.ts` e pelo boundary de escape em `runtime.ts`)
//     sem depender de `instanceof` (que falha através de bundlers/realms).
// ---------------------------------------------------------------------------

const RESOLVED_CREDENTIAL_SENTINEL = Symbol.for("brighter.provider-credentials-runtime.resolved-credential");
const INSPECT_CUSTOM = Symbol.for("nodejs.util.inspect.custom");

export type ResolvedCredentialMetadata = {
  secretReferenceId: string;
  provider: SecretReferenceProvider;
  secretType: SecretReferenceType;
  vaultProvider: VaultProvider;
  version: number;
  /** ISO-8601 UTC, se o backend do vault expõe expiração (nenhum nesta fase expõe). */
  expiresAt?: string;
};

export class CredentialAlreadyConsumedError extends Error {
  constructor(public readonly leaseId?: string) {
    super("credential_already_consumed: esta credencial é single-use e já foi consumida — solicite uma nova lease");
    this.name = "CredentialAlreadyConsumedError";
  }
}

export class CredentialAlreadyReleasedError extends Error {
  constructor(public readonly leaseId?: string) {
    super("credential_already_released: esta credencial já foi liberada/zerada — não pode mais ser usada");
    this.name = "CredentialAlreadyReleasedError";
  }
}

export class ResolvedCredential {
  readonly [RESOLVED_CREDENTIAL_SENTINEL] = true as const;

  #buffer: Buffer | null;
  #consumed = false;
  readonly id: string;
  readonly metadata: ResolvedCredentialMetadata;
  readonly singleUse: boolean;

  constructor(value: string, metadata: ResolvedCredentialMetadata, singleUse: boolean) {
    this.id = randomUUID();
    this.#buffer = Buffer.from(value, "utf8");
    this.metadata = metadata;
    this.singleUse = singleUse;
  }

  get released(): boolean {
    return this.#buffer === null;
  }

  get consumed(): boolean {
    return this.#consumed;
  }

  /**
   * Único jeito de ler o valor — entrega ao callback e descarta a referência
   * local logo em seguida (o `Buffer` continua vivo até `.release()`, mas o
   * `string` extraído aqui não é retido por este objeto). Se a política é
   * single-use, uma segunda chamada lança fail-closed.
   */
  use<T>(fn: (value: string) => T): T {
    if (this.#buffer === null) throw new CredentialAlreadyReleasedError(this.id);
    if (this.singleUse && this.#consumed) throw new CredentialAlreadyConsumedError(this.id);
    const value = this.#buffer.toString("utf8");
    this.#consumed = true;
    return fn(value);
  }

  /** Zera o buffer em memória e marca liberado. Idempotente — pode ser chamado múltiplas vezes com segurança. */
  release(): void {
    if (this.#buffer) {
      this.#buffer.fill(0);
      this.#buffer = null;
    }
  }

  toJSON(): string {
    return "[ResolvedCredential redacted]";
  }

  [INSPECT_CUSTOM](): string {
    return "[ResolvedCredential redacted]";
  }
}

/**
 * Detecção estrutural (não `instanceof`) de um `ResolvedCredential` embutido
 * em qualquer profundidade de um objeto — defesa contra um summary/log
 * colocar o wrapper inteiro debaixo de uma chave de nome inocente (o que um
 * denylist só-por-nome-de-chave, tipo `sanitizeDeep`, não pegaria). Usado por
 * `sanitization.ts::assertNoCredentialLeak` e pelo boundary de escape de
 * `runtime.ts::withProviderCredential`.
 */
export function containsResolvedCredential(value: unknown, seen: Set<unknown> = new Set()): boolean {
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (RESOLVED_CREDENTIAL_SENTINEL in (value as object)) return true;
  if (Array.isArray(value)) return value.some((item) => containsResolvedCredential(item, seen));
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (containsResolvedCredential(v, seen)) return true;
  }
  return false;
}

export function isResolvedCredential(value: unknown): value is ResolvedCredential {
  return typeof value === "object" && value !== null && RESOLVED_CREDENTIAL_SENTINEL in value;
}

// ---------------------------------------------------------------------------
// Vault Provider Contract — separado do domínio de propósito (mesma doutrina
// de `CredentialsVault` vs `SecretReferenceReader`): implementações concretas
// em `providers/*.ts`.
// ---------------------------------------------------------------------------

export type RuntimeVaultProviderHealth = {
  id: RuntimeVaultProviderId;
  available: boolean;
  message: string;
};

export type ResolveSecretOptions = {
  /** Decidido pela policy/runtime, nunca pelo vault provider — thread-through só. */
  singleUse: boolean;
};

export interface RuntimeVaultProvider {
  readonly id: RuntimeVaultProviderId;
  supports(vaultProvider: VaultProvider): boolean;
  resolveSecret(reference: SecretReferenceMetadata, options: ResolveSecretOptions): Promise<ResolvedCredential>;
  validateReference(reference: SecretReferenceMetadata): Promise<{ valid: boolean; errors: string[] }>;
  healthPreview(): Promise<RuntimeVaultProviderHealth>;
}
