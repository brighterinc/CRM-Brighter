/**
 * Tipos centrais da Brighter Provisioning Adapters Foundation — v1.
 *
 * Este módulo NUNCA executa infraestrutura real (sem VPS, Supabase, Vercel,
 * DNS, Docker, systemd, Evolution, WAHA, Chatwoot). Traduz uma etapa
 * ABSTRATA do Provisioning Engine (`lib/provisioning/`) para um "provider
 * concreto" — mas só como contrato tipado, blueprint e simulador
 * determinístico. `mode: "real"` existe apenas como literal de tipo
 * RESERVADO — nenhum adapter desta Foundation o implementa (ver
 * `ProvisioningProviderAdapter.executeReal` abaixo, que sempre lança
 * `RealProvisioningDisabledError`).
 *
 * Não duplica `ProvisioningPlan`/`ProvisioningStepDefinition`
 * (`lib/provisioning/`) nem `DeploymentPlan` (`lib/deployment/`) — reusa via
 * import de tipo. Nunca decide ordem global de execução: isso continua
 * exclusivamente com `lib/provisioning/planner.ts`.
 */
import type { DeploymentPlan } from "@/lib/deployment";

export type ProvisioningProvider =
  | "noop"
  | "fake"
  | "supabase"
  | "vercel"
  | "dns"
  | "vps"
  | "docker"
  | "reverse_proxy"
  | "redis"
  | "email"
  | "whatsapp"
  | "chatwoot"
  | "evolution"
  | "waha";

export const PROVISIONING_PROVIDERS: ProvisioningProvider[] = [
  "noop",
  "fake",
  "supabase",
  "vercel",
  "dns",
  "vps",
  "docker",
  "reverse_proxy",
  "redis",
  "email",
  "whatsapp",
  "chatwoot",
  "evolution",
  "waha",
];

/**
 * `"real"` é reservado — literal de tipo alcançável, nunca de fato usado por
 * nenhum construtor/factory desta Foundation. Ver `RealProvisioningDisabledError`.
 */
export type ProvisioningAdapterMode = "dry_run" | "simulation" | "real";

export type ProvisioningAdapterStatus = "available" | "unavailable" | "planned" | "disabled";

export type ProvisioningAdapterCapability = {
  id: string;
  provider: ProvisioningProvider;
  operation: string;
  description: string;
  supportedPlans: DeploymentPlan[];
  requiredModules?: string[];
  requiredInfra?: string[];
  supportsDryRun: boolean;
  supportsRollbackPreview: boolean;
  /** SEMPRE `false` nesta Foundation — reservado pra fase futura de adapters reais. */
  realExecutionAvailable: boolean;
};

export type ProvisioningAdapterRequest = {
  installationId: string;
  tenantId: string;
  stepId: string;
  provider: ProvisioningProvider;
  operation: string;
  mode: "dry_run" | "simulation";
  /** Já sanitizado (`sanitizeDeep`) antes de sair de `mapper.ts` — nunca segredo. */
  input: Record<string, unknown>;
  idempotencyKey: string;
  /** ISO-8601 UTC. */
  requestedAt: string;
};

export type ProvisioningAdapterResultStatus = "simulated" | "ready" | "blocked" | "failed" | "skipped";

export type ProvisioningRollbackPreview = {
  provider: ProvisioningProvider;
  operation: string;
  reversible: boolean;
  steps: string[];
  warnings: string[];
};

export type ProvisioningAdapterResult = {
  requestId: string;
  provider: ProvisioningProvider;
  operation: string;
  status: ProvisioningAdapterResultStatus;
  /** Já sanitizado — nunca segredo. */
  output: Record<string, unknown>;
  blockers: string[];
  warnings: string[];
  rollbackAvailable: boolean;
  rollbackPreview?: ProvisioningRollbackPreview;
  /** ISO-8601 UTC. */
  completedAt: string;
};

/**
 * Lançado sempre que algum código (mesmo interno) tentar chegar a uma
 * execução real de provider nesta Foundation. Nenhum `ProvisioningProviderAdapter`
 * desta Foundation implementa `executeReal` de fato — todos herdam o
 * comportamento de lançar este erro.
 */
export class RealProvisioningDisabledError extends Error {
  constructor(
    public readonly provider: ProvisioningProvider,
    public readonly operation: string,
  ) {
    super(
      `real_provisioning_disabled: execução real de "${provider}.${operation}" não está disponível nesta Foundation — só dry-run/simulação`,
    );
    this.name = "RealProvisioningDisabledError";
  }
}

/**
 * Contrato que cada blueprint de provider implementa — `lib/provisioning-adapters/providers/*.ts`.
 * Nunca chama rede/Docker/shell/filesystem externo. `executeReal` é reservado:
 * toda implementação concreta lança `RealProvisioningDisabledError`.
 */
export type ProvisioningProviderAdapter = {
  readonly providerId: ProvisioningProvider;
  capabilities(): ProvisioningAdapterCapability[];
  supports(operation: string): boolean;
  validate(request: ProvisioningAdapterRequest): { valid: boolean; errors: string[] };
  dryRun(request: ProvisioningAdapterRequest): Promise<ProvisioningAdapterResult>;
  rollbackPreview(
    request: ProvisioningAdapterRequest,
    result?: ProvisioningAdapterResult,
  ): ProvisioningRollbackPreview;
  sanitizeInput(input: Record<string, unknown>): Record<string, unknown>;
  sanitizeOutput(output: Record<string, unknown>): Record<string, unknown>;
  /** Reservado — SEMPRE lança `RealProvisioningDisabledError` nesta Foundation. */
  executeReal(request: ProvisioningAdapterRequest): Promise<ProvisioningAdapterResult>;
};

export type { DeploymentPlan };
