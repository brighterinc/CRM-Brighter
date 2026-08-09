/**
 * `mapProvisioningStepToAdapterRequest` — Provisioning Adapters Foundation v1.
 *
 * Função pura: mapeia UMA etapa de um `ProvisioningPlan` (`lib/provisioning/`)
 * pro `ProvisioningAdapterRequest` do provider resolvido pelo registry.
 * NUNCA lê `process.env`, NUNCA persiste, NUNCA executa nada — só monta o
 * request sanitizado. Detecta e reporta (nunca lança) etapa sem provider,
 * provider sem adapter registrado, adapter sem a capability, e capability
 * incompatível com o plano comercial da instalação.
 */
import { createHash } from "node:crypto";

import type { ProvisioningPlan } from "@/lib/provisioning";

import { sanitizeAdapterInput } from "./sanitization";
import type { ProvisioningAdapterRegistry } from "./registry";
import type { ProvisioningAdapterCapability, ProvisioningAdapterRequest, ProvisioningProvider } from "./types";

/** Serialização estável — mesmo objeto (independente de ordem de chave) sempre produz a mesma string. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export type BuildAdapterIdempotencyKeyInput = {
  tenantId: string;
  installationId: string;
  stepId: string;
  provider: ProvisioningProvider;
  operation: string;
  /** Já sanitizado — nunca segredo. */
  input: Record<string, unknown>;
  planFingerprint: string;
};

/** Mesmo input (mesma ordem lógica) → mesma chave. Nunca inclui segredo (input já chega sanitizado). */
export function buildAdapterIdempotencyKey(input: BuildAdapterIdempotencyKeyInput): string {
  const stable = {
    tenantId: input.tenantId,
    installationId: input.installationId,
    stepId: input.stepId,
    provider: input.provider,
    operation: input.operation,
    input: input.input,
    planFingerprint: input.planFingerprint,
  };
  const hash = createHash("sha256").update(stableStringify(stable)).digest("hex");
  return `padk_${hash.slice(0, 20)}`;
}

export type MapProvisioningStepToAdapterRequestInput = {
  installationId: string;
  tenantId: string;
  plan: Pick<ProvisioningPlan, "plan" | "target" | "manifestFingerprint">;
  stepId: string;
  registry: ProvisioningAdapterRegistry;
  /** Contexto extra não-sensível (nunca segredo) — sanitizado mesmo assim. */
  extraInput?: Record<string, unknown>;
  /** ISO-8601 UTC — default `new Date().toISOString()`. Parametrizável só pra teste determinístico. */
  requestedAt?: string;
};

export type MapProvisioningStepToAdapterRequestResult =
  | { status: "resolved"; request: ProvisioningAdapterRequest; capability: ProvisioningAdapterCapability }
  | { status: "unmapped"; stepId: string }
  | { status: "missing_adapter"; stepId: string; provider: ProvisioningProvider; operation: string }
  | { status: "missing_capability"; stepId: string; provider: ProvisioningProvider; operation: string }
  | {
      status: "incompatible_plan";
      stepId: string;
      provider: ProvisioningProvider;
      operation: string;
      plan: ProvisioningPlan["plan"];
    };

export function mapProvisioningStepToAdapterRequest(
  input: MapProvisioningStepToAdapterRequestInput,
): MapProvisioningStepToAdapterRequestResult {
  const resolution = input.registry.resolveAdapterForStep(input.stepId, input.plan.target);

  if (resolution.status === "unmapped") return { status: "unmapped", stepId: input.stepId };
  if (resolution.status === "missing_adapter") {
    return { status: "missing_adapter", stepId: input.stepId, provider: resolution.provider, operation: resolution.operation };
  }
  if (resolution.status === "missing_capability") {
    return { status: "missing_capability", stepId: input.stepId, provider: resolution.provider, operation: resolution.operation };
  }

  const { provider, operation, capability } = resolution;
  if (!capability.supportedPlans.includes(input.plan.plan)) {
    return { status: "incompatible_plan", stepId: input.stepId, provider, operation, plan: input.plan.plan };
  }

  const sanitizedInput = sanitizeAdapterInput({
    ...(input.extraInput ?? {}),
    stepId: input.stepId,
    plan: input.plan.plan,
    target: input.plan.target,
  });

  const requestedAt = input.requestedAt ?? new Date().toISOString();
  const idempotencyKey = buildAdapterIdempotencyKey({
    tenantId: input.tenantId,
    installationId: input.installationId,
    stepId: input.stepId,
    provider,
    operation,
    input: sanitizedInput,
    planFingerprint: input.plan.manifestFingerprint,
  });

  const request: ProvisioningAdapterRequest = {
    installationId: input.installationId,
    tenantId: input.tenantId,
    stepId: input.stepId,
    provider,
    operation,
    mode: "dry_run",
    input: sanitizedInput,
    idempotencyKey,
    requestedAt,
  };

  return { status: "resolved", request, capability };
}
