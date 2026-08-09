/**
 * Registry central de adapters — Provisioning Adapters Foundation v1.
 *
 * Um `ProvisioningProviderAdapter` por `providerId` (nunca dois adapters pro
 * mesmo provider — rejeitado). Sem singleton global mutável: cada chamador
 * (CLI, página admin, teste) monta sua própria instância via
 * `createDefaultProvisioningAdapterRegistry()` (`providers/index.ts`) — nunca
 * um módulo compartilhado que uma chamada pode mutar e vazar pra outra.
 */
import { findCapability } from "./capabilities";
import { resolveStepAdapterMapping } from "./catalog";
import type { DeploymentTarget } from "@/lib/deployment";
import type { ProvisioningAdapterCapability, ProvisioningProvider, ProvisioningProviderAdapter } from "./types";
import { PROVISIONING_PROVIDERS } from "./types";

export class ProvisioningAdapterAlreadyRegisteredError extends Error {
  constructor(public readonly provider: ProvisioningProvider) {
    super(`provisioning_adapter_already_registered: provider "${provider}" já tem um adapter registrado`);
    this.name = "ProvisioningAdapterAlreadyRegisteredError";
  }
}

export type ProvisioningAdapterResolution =
  | { status: "resolved"; provider: ProvisioningProvider; operation: string; adapter: ProvisioningProviderAdapter; capability: ProvisioningAdapterCapability }
  | { status: "missing_adapter"; provider: ProvisioningProvider; operation: string }
  | { status: "missing_capability"; provider: ProvisioningProvider; operation: string; adapter: ProvisioningProviderAdapter }
  | { status: "unmapped"; stepId: string };

export class ProvisioningAdapterRegistry {
  private readonly adapters = new Map<ProvisioningProvider, ProvisioningProviderAdapter>();

  registerAdapter(adapter: ProvisioningProviderAdapter): void {
    if (this.adapters.has(adapter.providerId)) {
      throw new ProvisioningAdapterAlreadyRegisteredError(adapter.providerId);
    }
    this.adapters.set(adapter.providerId, adapter);
  }

  unregisterAdapter(provider: ProvisioningProvider): void {
    this.adapters.delete(provider);
  }

  findAdapter(provider: ProvisioningProvider): ProvisioningProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  /** Ordem sempre canônica (`PROVISIONING_PROVIDERS`) — nunca ordem de registro, pra ser determinístico independente de quem chamou primeiro. */
  listAdapters(): ProvisioningProviderAdapter[] {
    return PROVISIONING_PROVIDERS.map((p) => this.adapters.get(p)).filter((a): a is ProvisioningProviderAdapter => Boolean(a));
  }

  listCapabilities(): ProvisioningAdapterCapability[] {
    return this.listAdapters().flatMap((a) => a.capabilities());
  }

  findCapability(provider: ProvisioningProvider, operation: string): ProvisioningAdapterCapability | undefined {
    const adapter = this.findAdapter(provider);
    if (!adapter) return undefined;
    return adapter.capabilities().find((c) => c.operation === operation) ?? findCapability(provider, operation);
  }

  /**
   * Resolve o adapter responsável por uma etapa do Provisioning Engine,
   * considerando o `target` da instalação. Nunca lança — cada desfecho
   * (`unmapped`/`missing_adapter`/`missing_capability`/`resolved`) é um
   * status explícito pro chamador (`mapper.ts`/`executor.ts`) decidir o que
   * fazer, nunca uma exceção que interrompe o resto do plano.
   */
  resolveAdapterForStep(stepId: string, target: DeploymentTarget): ProvisioningAdapterResolution {
    const mapping = resolveStepAdapterMapping(stepId, target);
    if (!mapping) return { status: "unmapped", stepId };

    const adapter = this.findAdapter(mapping.provider);
    if (!adapter) return { status: "missing_adapter", provider: mapping.provider, operation: mapping.operation };

    if (!adapter.supports(mapping.operation)) {
      return { status: "missing_capability", provider: mapping.provider, operation: mapping.operation, adapter };
    }

    const capability = this.findCapability(mapping.provider, mapping.operation);
    if (!capability) {
      return { status: "missing_capability", provider: mapping.provider, operation: mapping.operation, adapter };
    }

    return { status: "resolved", provider: mapping.provider, operation: mapping.operation, adapter, capability };
  }
}
