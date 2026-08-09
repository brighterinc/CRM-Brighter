/**
 * Simulação determinística da Provisioning Adapters Foundation — v1.
 * `simulateProvisioningAdapterScenario` é o dry-run pedido — NUNCA cria
 * infraestrutura real, NUNCA persiste fora do `InMemoryProvisioningAdapterRepository`
 * local do próprio cenário. Cada cenário é NOMEADO e determinístico (nunca
 * `Math.random` implícito) — mesmo espírito de `simulateMarketplaceScenario`/
 * `simulateOutreachScenario`/`simulateBillingScenario`.
 */
import { createDemoInstallations } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";
import { generateProvisioningPlan, generateProvisioningSummary, type ProvisioningPlan } from "@/lib/provisioning";

import { executeProvisioningDryRun, type ProvisioningAdapterStepOutcome } from "./executor";
import { buildAdapterIdempotencyKey } from "./mapper";
import { createDefaultProvisioningAdapterRegistry, VercelProvisioningProviderAdapter } from "./providers";
import { InMemoryProvisioningAdapterRepository } from "./repository";
import type { ProvisioningAdapterRegistry } from "./registry";
import { generateProvisioningRollbackPreview, type ProvisioningAdapterRollbackEntry } from "./rollback";
import { sanitizeAdapterInput } from "./sanitization";
import type { ProvisioningAdapterRequest, ProvisioningAdapterResult, ProvisioningProvider, ProvisioningProviderAdapter } from "./types";

export type ProvisioningAdapterSimulationScenario =
  | "lite-healthy"
  | "pro-healthy"
  | "dedicated-healthy"
  | "missing-adapter"
  | "capability-missing"
  | "invalid-request"
  | "dependency-failure"
  | "supabase-ready"
  | "vercel-ready"
  | "dns-ready"
  | "vps-ready"
  | "docker-ready"
  | "redis-ready"
  | "whatsapp-ready"
  | "chatwoot-ready"
  | "evolution-ready"
  | "waha-ready"
  | "rollback-preview"
  | "idempotent-repeat"
  | "blocker"
  | "partial"
  | "failed-step";

export const PROVISIONING_ADAPTER_SIMULATION_SCENARIOS: ProvisioningAdapterSimulationScenario[] = [
  "lite-healthy",
  "pro-healthy",
  "dedicated-healthy",
  "missing-adapter",
  "capability-missing",
  "invalid-request",
  "dependency-failure",
  "supabase-ready",
  "vercel-ready",
  "dns-ready",
  "vps-ready",
  "docker-ready",
  "redis-ready",
  "whatsapp-ready",
  "chatwoot-ready",
  "evolution-ready",
  "waha-ready",
  "rollback-preview",
  "idempotent-repeat",
  "blocker",
  "partial",
  "failed-step",
];

const NOW = "2026-08-08T12:00:00.000Z";

export type ProvisioningAdapterSimulationResult = {
  scenario: ProvisioningAdapterSimulationScenario;
  installation: Installation;
  plan: ProvisioningPlan;
  outcomes: ProvisioningAdapterStepOutcome[];
  rollbackPreview: ProvisioningAdapterRollbackEntry[];
  blockers: string[];
  warnings: string[];
  /** Só presente em `idempotent-repeat` — prova que a 2ª rodada reusou os mesmos `requestId`. */
  repeatedRun?: { firstRequestIds: string[]; secondRequestIds: string[]; matched: boolean };
};

/**
 * `createDemoTenants()` (`lib/tenants/repository.ts`) não preenche todo
 * item BLOCKER de `evaluateTenantReadiness` (`lib/tenants/readiness.ts`) —
 * o tenant Lite base nunca teve `supportEmail`/`accountManager`/
 * `infrastructure`/`supabase`, e nenhum dos 3 tem `accountManager`. Como
 * `generateProvisioningPlan` chama `validateTenantReadinessForProvisioning`
 * (que é só um passthrough de `evaluateTenantReadiness`), as 3 instalações
 * demo nasceriam SEMPRE com `plan.blockers` preenchido — mesmo pros
 * cenários que nada têm a ver com prontidão de tenant (essa já é
 * responsabilidade testada da Tenant Engine, não desta Foundation). Preenche
 * só os campos AUSENTES (nunca sobrescreve o que o fixture já definiu, nunca
 * muta o fixture compartilhado — cada chamada de `createDemoInstallations()`
 * já devolve objetos novos), mantendo `installation.branding` sincronizado
 * com `installation.tenant.branding` (mesmo invariante documentado em
 * `lib/control-plane/types.ts`).
 */
function ensureHealthyTenant(installation: Installation): Installation {
  let tenant = installation.tenant;

  if (!tenant.branding.supportEmail) {
    tenant = { ...tenant, branding: { ...tenant.branding, supportEmail: "suporte@brighter.invalid" } };
  }
  if (!tenant.accountManager) {
    tenant = { ...tenant, accountManager: { name: "Responsável de simulação", email: "responsavel@brighter.invalid" } };
  }
  if (!tenant.infrastructure) {
    tenant = {
      ...tenant,
      infrastructure:
        tenant.plan === "dedicated"
          ? { target: "vps", provider: "hostgator", externalId: "vps-simulacao-001" }
          : { target: "vercel", projectReference: "prj-simulacao-001" },
    };
  }
  if (!tenant.supabase) {
    tenant = { ...tenant, supabase: { projectRef: "simulacaoref", projectUrl: "https://simulacaoref.supabase.co" } };
  }

  if (tenant === installation.tenant) return installation;

  // `installation.provisioning` foi précalculado por `createDemoInstallations()`
  // a partir do tenant NÃO corrigido — recalcula pra não deixar
  // `installation.provisioning.blockers` divergente do `plan` que este
  // arquivo de fato usa (mesma regra de consistência de
  // `lib/control-plane/repository.ts`: `provisioning` é sempre derivado do
  // MESMO tenant+manifest, nunca uma cópia solta que pode dessincronizar).
  const patchedPlan = generateProvisioningPlan({ tenant, manifest: installation.deployment });
  const provisioning = generateProvisioningSummary(patchedPlan, installation.deployment);

  return { ...installation, branding: tenant.branding, tenant, provisioning };
}

function pickInstallation(plan: "lite" | "pro" | "dedicated", override?: Installation): Installation {
  if (override) return override;
  const demo = createDemoInstallations();
  const found = demo.find((i) => i.deploymentPlan === plan) ?? demo[0];
  if (!found) throw new Error(`simulate_provisioning_adapter_scenario: nenhuma Installation de demonstração para o plano "${plan}"`);
  return ensureHealthyTenant(found);
}

function buildPlan(installation: Installation): ProvisioningPlan {
  return generateProvisioningPlan({ tenant: installation.tenant, manifest: installation.deployment });
}

async function runDryRun(
  installation: Installation,
  plan: ProvisioningPlan,
  registry: ProvisioningAdapterRegistry,
  repository?: InMemoryProvisioningAdapterRepository,
): Promise<ProvisioningAdapterStepOutcome[]> {
  const { outcomes } = await executeProvisioningDryRun(plan, {
    installationId: installation.id,
    tenantId: installation.tenant.id,
    registry,
    repository,
  });
  return outcomes;
}

/**
 * Adapter com um subconjunto de operações REMOVIDO — só usado pra demonstrar
 * `capability-missing`, nunca um provider real. `validate`/`dryRun` do
 * `base` são closures fechadas sobre o catálogo COMPLETO do provider (nunca
 * leem de volta `this.capabilities()`), então um simples `{ ...base,
 * capabilities: ... }` não bastaria — este wrapper reimplementa o
 * curto-circuito explicitamente checando `supports()` antes de delegar.
 */
function buildReducedCapabilityAdapter(base: ProvisioningProviderAdapter, excludedOperations: string[]): ProvisioningProviderAdapter {
  const capabilities = () => base.capabilities().filter((c) => !excludedOperations.includes(c.operation));
  const supports = (operation: string) => !excludedOperations.includes(operation) && base.supports(operation);

  return {
    providerId: base.providerId,
    capabilities,
    supports,
    validate: (request) =>
      supports(request.operation)
        ? base.validate(request)
        : { valid: false, errors: [`operação "${request.operation}" não é suportada pelo adapter "${base.providerId}" (capability removida nesta simulação)`] },
    dryRun: async (request): Promise<ProvisioningAdapterResult> =>
      supports(request.operation)
        ? base.dryRun(request)
        : {
            requestId: crypto.randomUUID(),
            provider: base.providerId,
            operation: request.operation,
            status: "blocked",
            output: {},
            blockers: [`operação "${request.operation}" não é suportada pelo adapter "${base.providerId}" (capability removida nesta simulação)`],
            warnings: [],
            rollbackAvailable: false,
            completedAt: new Date().toISOString(),
          },
    rollbackPreview: base.rollbackPreview,
    sanitizeInput: base.sanitizeInput,
    sanitizeOutput: base.sanitizeOutput,
    executeReal: base.executeReal,
  };
}

function buildDirectRequest(opts: {
  installation: Installation;
  plan: ProvisioningPlan;
  provider: ProvisioningProvider;
  operation: string;
  extraInput?: Record<string, unknown>;
}): ProvisioningAdapterRequest {
  const stepId = `simulate.${opts.provider}.${opts.operation}`;
  const sanitizedInput = sanitizeAdapterInput({
    ...(opts.extraInput ?? {}),
    stepId,
    plan: opts.plan.plan,
    target: opts.plan.target,
  });
  const idempotencyKey = buildAdapterIdempotencyKey({
    tenantId: opts.installation.tenant.id,
    installationId: opts.installation.id,
    stepId,
    provider: opts.provider,
    operation: opts.operation,
    input: sanitizedInput,
    planFingerprint: opts.plan.manifestFingerprint,
  });
  return {
    installationId: opts.installation.id,
    tenantId: opts.installation.tenant.id,
    stepId,
    provider: opts.provider,
    operation: opts.operation,
    mode: "dry_run",
    input: sanitizedInput,
    idempotencyKey,
    requestedAt: NOW,
  };
}

async function runDirectReadyScenario(
  scenario: ProvisioningAdapterSimulationScenario,
  installation: Installation,
  plan: ProvisioningPlan,
  registry: ProvisioningAdapterRegistry,
  provider: ProvisioningProvider,
  operation: string,
): Promise<ProvisioningAdapterSimulationResult> {
  const request = buildDirectRequest({ installation, plan, provider, operation });
  const adapter = registry.findAdapter(provider);
  if (!adapter) throw new Error(`simulate_provisioning_adapter_scenario: provider "${provider}" não registrado nesta simulação`);

  const result = await adapter.dryRun(request);
  const capability = registry.findCapability(provider, operation);
  const outcome: ProvisioningAdapterStepOutcome = capability
    ? { stepId: request.stepId, mapping: { status: "resolved", request, capability }, result }
    : { stepId: request.stepId, mapping: { status: "missing_capability", stepId: request.stepId, provider, operation }, result };

  return finalize(scenario, installation, plan, [outcome]);
}

function finalize(
  scenario: ProvisioningAdapterSimulationScenario,
  installation: Installation,
  plan: ProvisioningPlan,
  outcomes: ProvisioningAdapterStepOutcome[],
  extra: Partial<Pick<ProvisioningAdapterSimulationResult, "repeatedRun">> = {},
): ProvisioningAdapterSimulationResult {
  const rollbackPreview = generateProvisioningRollbackPreview(outcomes);
  const blockers = [...plan.blockers, ...outcomes.flatMap((o) => o.result?.blockers ?? [])];
  const warnings = [...plan.warnings, ...outcomes.flatMap((o) => o.result?.warnings ?? [])];
  return { scenario, installation, plan, outcomes, rollbackPreview, blockers, warnings, ...extra };
}

/** `simulateProvisioningAdapterScenario` — nunca provisiona, cobra ou executa de verdade. */
export async function simulateProvisioningAdapterScenario(
  scenario: ProvisioningAdapterSimulationScenario,
  opts: { installation?: Installation } = {},
): Promise<ProvisioningAdapterSimulationResult> {
  switch (scenario) {
    case "lite-healthy": {
      const installation = pickInstallation("lite", opts.installation);
      const plan = buildPlan(installation);
      const outcomes = await runDryRun(installation, plan, createDefaultProvisioningAdapterRegistry());
      return finalize(scenario, installation, plan, outcomes);
    }

    case "pro-healthy": {
      const installation = pickInstallation("pro", opts.installation);
      const plan = buildPlan(installation);
      const outcomes = await runDryRun(installation, plan, createDefaultProvisioningAdapterRegistry());
      return finalize(scenario, installation, plan, outcomes);
    }

    case "dedicated-healthy":
    case "rollback-preview": {
      const installation = pickInstallation("dedicated", opts.installation);
      const plan = buildPlan(installation);
      const outcomes = await runDryRun(installation, plan, createDefaultProvisioningAdapterRegistry());
      return finalize(scenario, installation, plan, outcomes);
    }

    case "missing-adapter": {
      const installation = pickInstallation("dedicated", opts.installation);
      const plan = buildPlan(installation);
      const registry = createDefaultProvisioningAdapterRegistry();
      registry.unregisterAdapter("supabase");
      const outcomes = await runDryRun(installation, plan, registry);
      return finalize(scenario, installation, plan, outcomes);
    }

    case "capability-missing": {
      const installation = pickInstallation("pro", opts.installation);
      const plan = buildPlan(installation);
      const registry = createDefaultProvisioningAdapterRegistry();
      registry.unregisterAdapter("vercel");
      registry.registerAdapter(buildReducedCapabilityAdapter(VercelProvisioningProviderAdapter, ["project.create"]));
      const outcomes = await runDryRun(installation, plan, registry);
      return finalize(scenario, installation, plan, outcomes);
    }

    case "invalid-request": {
      const installation = pickInstallation("dedicated", opts.installation);
      const plan = buildPlan(installation);
      const registry = createDefaultProvisioningAdapterRegistry();
      const badRequest: ProvisioningAdapterRequest = {
        installationId: "",
        tenantId: "",
        stepId: "create_supabase_project",
        provider: "supabase",
        operation: "project.create",
        mode: "dry_run",
        input: {},
        idempotencyKey: "",
        requestedAt: NOW,
      };
      const result = await registry.findAdapter("supabase")!.dryRun(badRequest);
      const outcome: ProvisioningAdapterStepOutcome = {
        stepId: badRequest.stepId,
        mapping: { status: "resolved", request: badRequest, capability: registry.findCapability("supabase", "project.create")! },
        result,
      };
      return finalize(scenario, installation, plan, [outcome]);
    }

    case "dependency-failure": {
      const installation = pickInstallation("dedicated", opts.installation);
      const plan = buildPlan(installation);
      const registry = createDefaultProvisioningAdapterRegistry();
      // Remove "vps" — derruba em cascata install_runtime/reverse_proxy/redis/worker/scheduler,
      // que dependem (direta ou transitivamente) de `prepare_vps`.
      registry.unregisterAdapter("vps");
      const outcomes = await runDryRun(installation, plan, registry);
      return finalize(scenario, installation, plan, outcomes);
    }

    case "partial": {
      const installation = pickInstallation("dedicated", opts.installation);
      const plan = buildPlan(installation);
      const registry = createDefaultProvisioningAdapterRegistry();
      // Remove só "docker" — supabase/dns/vps/email/whatsapp seguem prontos,
      // install_runtime + downstream ficam bloqueados: mistura real de
      // prontos e bloqueados no mesmo plano.
      registry.unregisterAdapter("docker");
      const outcomes = await runDryRun(installation, plan, registry);
      return finalize(scenario, installation, plan, outcomes);
    }

    case "blocker": {
      const installation = pickInstallation("dedicated", opts.installation);
      const plan = buildPlan(installation);
      plan.blockers = [...plan.blockers, "bloqueio sintético do cenário de simulação — nenhuma etapa é executada"];
      const outcomes = await runDryRun(installation, plan, createDefaultProvisioningAdapterRegistry());
      return finalize(scenario, installation, plan, outcomes);
    }

    case "failed-step": {
      const installation = pickInstallation("dedicated", opts.installation);
      const plan = buildPlan(installation);
      const registry = createDefaultProvisioningAdapterRegistry();
      const request = buildDirectRequest({
        installation,
        plan,
        provider: "supabase",
        operation: "project.create",
        extraInput: { __simulateFailure: true },
      });
      const result = await registry.findAdapter("supabase")!.dryRun(request);
      const outcome: ProvisioningAdapterStepOutcome = {
        stepId: request.stepId,
        mapping: { status: "resolved", request, capability: registry.findCapability("supabase", "project.create")! },
        result,
      };
      return finalize(scenario, installation, plan, [outcome]);
    }

    case "idempotent-repeat": {
      const installation = pickInstallation("dedicated", opts.installation);
      const plan = buildPlan(installation);
      const registry = createDefaultProvisioningAdapterRegistry();
      const repository = new InMemoryProvisioningAdapterRepository();
      const first = await runDryRun(installation, plan, registry, repository);
      const second = await runDryRun(installation, plan, registry, repository);
      const firstRequestIds = first.filter((o) => o.result).map((o) => o.result!.requestId);
      const secondRequestIds = second.filter((o) => o.result).map((o) => o.result!.requestId);
      const matched = firstRequestIds.length === secondRequestIds.length && firstRequestIds.every((id, i) => id === secondRequestIds[i]);
      return finalize(scenario, installation, plan, second, { repeatedRun: { firstRequestIds, secondRequestIds, matched } });
    }

    case "supabase-ready": {
      const installation = pickInstallation("dedicated", opts.installation);
      return runDirectReadyScenario(scenario, installation, buildPlan(installation), createDefaultProvisioningAdapterRegistry(), "supabase", "project.create");
    }
    case "vercel-ready": {
      const installation = pickInstallation("pro", opts.installation);
      return runDirectReadyScenario(scenario, installation, buildPlan(installation), createDefaultProvisioningAdapterRegistry(), "vercel", "project.create");
    }
    case "dns-ready": {
      const installation = pickInstallation("dedicated", opts.installation);
      return runDirectReadyScenario(scenario, installation, buildPlan(installation), createDefaultProvisioningAdapterRegistry(), "dns", "record.plan");
    }
    case "vps-ready": {
      const installation = pickInstallation("dedicated", opts.installation);
      return runDirectReadyScenario(scenario, installation, buildPlan(installation), createDefaultProvisioningAdapterRegistry(), "vps", "server.validate");
    }
    case "docker-ready": {
      const installation = pickInstallation("dedicated", opts.installation);
      return runDirectReadyScenario(scenario, installation, buildPlan(installation), createDefaultProvisioningAdapterRegistry(), "docker", "compose.validate");
    }
    case "redis-ready": {
      const installation = pickInstallation("dedicated", opts.installation);
      return runDirectReadyScenario(scenario, installation, buildPlan(installation), createDefaultProvisioningAdapterRegistry(), "redis", "instance.plan");
    }
    case "whatsapp-ready": {
      const installation = pickInstallation("dedicated", opts.installation);
      return runDirectReadyScenario(scenario, installation, buildPlan(installation), createDefaultProvisioningAdapterRegistry(), "whatsapp", "channel.plan");
    }
    case "chatwoot-ready": {
      const installation = pickInstallation("dedicated", opts.installation);
      return runDirectReadyScenario(scenario, installation, buildPlan(installation), createDefaultProvisioningAdapterRegistry(), "chatwoot", "account.plan");
    }
    case "evolution-ready": {
      const installation = pickInstallation("dedicated", opts.installation);
      return runDirectReadyScenario(scenario, installation, buildPlan(installation), createDefaultProvisioningAdapterRegistry(), "evolution", "instance.plan");
    }
    case "waha-ready": {
      const installation = pickInstallation("dedicated", opts.installation);
      return runDirectReadyScenario(scenario, installation, buildPlan(installation), createDefaultProvisioningAdapterRegistry(), "waha", "session.plan");
    }

    default: {
      const exhaustive: never = scenario;
      throw new Error(`simulate_provisioning_adapter_scenario: cenário desconhecido "${exhaustive}"`);
    }
  }
}
