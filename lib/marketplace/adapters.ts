/**
 * Adaptadores abstratos — spec §15. Nenhum adaptador aqui altera env, chama
 * API, faz deploy, ativa módulo real, cobra ou provisiona. Adaptadores reais
 * ficam pra uma fase futura (ver ROADMAP.md). Mesma forma de
 * `BillingProviderAdapter`/`MonitoringAdapter`/`ProvisioningAdapter`.
 */
import type { ModuleActivationDesiredState } from "./types";

/** Sempre `simulated: true` — nunca finge ter ativado/cobrado/provisionado de verdade. */
export type MarketplaceAdapterResult = {
  adapterId: string;
  simulated: true;
  message: string;
  metadata?: Record<string, unknown>;
};

export type ModuleActivationAdapter = {
  adapterId: string;
  activate(moduleId: string, desiredState: ModuleActivationDesiredState): Promise<MarketplaceAdapterResult>;
};

export type MarketplaceBillingAdapter = {
  adapterId: string;
  checkEntitlement(moduleId: string): Promise<MarketplaceAdapterResult>;
};

export type MarketplaceProvisioningAdapter = {
  adapterId: string;
  attachActivationSteps(moduleId: string): Promise<MarketplaceAdapterResult>;
};

// ---------------------------------------------------------------------------
// Noop — documenta explicitamente que nada foi integrado, nunca simula sucesso.
// ---------------------------------------------------------------------------

export class NoopModuleActivationAdapter implements ModuleActivationAdapter {
  readonly adapterId = "noop";
  async activate(moduleId: string, desiredState: ModuleActivationDesiredState): Promise<MarketplaceAdapterResult> {
    return { adapterId: this.adapterId, simulated: true, message: `no-op — "${moduleId}" (${desiredState}) não foi ativado de verdade nesta Foundation` };
  }
}

export class NoopMarketplaceBillingAdapter implements MarketplaceBillingAdapter {
  readonly adapterId = "noop";
  async checkEntitlement(moduleId: string): Promise<MarketplaceAdapterResult> {
    return { adapterId: this.adapterId, simulated: true, message: `no-op — nenhuma checagem financeira real feita para "${moduleId}"` };
  }
}

export class NoopMarketplaceProvisioningAdapter implements MarketplaceProvisioningAdapter {
  readonly adapterId = "noop";
  async attachActivationSteps(moduleId: string): Promise<MarketplaceAdapterResult> {
    return { adapterId: this.adapterId, simulated: true, message: `no-op — nenhuma etapa de provisionamento real anexada para "${moduleId}"` };
  }
}

// ---------------------------------------------------------------------------
// Fake — determinístico e configurável, ids sintéticos derivados do próprio input, nunca I/O real.
// ---------------------------------------------------------------------------

export class FakeModuleActivationAdapter implements ModuleActivationAdapter {
  readonly adapterId = "fake";
  async activate(moduleId: string, desiredState: ModuleActivationDesiredState): Promise<MarketplaceAdapterResult> {
    return {
      adapterId: this.adapterId,
      simulated: true,
      message: `preview sintético de ativação para "${moduleId}" (${desiredState})`,
      metadata: { moduleId, desiredState },
    };
  }
}

export class FakeMarketplaceBillingAdapter implements MarketplaceBillingAdapter {
  readonly adapterId = "fake";
  async checkEntitlement(moduleId: string): Promise<MarketplaceAdapterResult> {
    return {
      adapterId: this.adapterId,
      simulated: true,
      message: `preview sintético de entitlement financeiro para "${moduleId}"`,
      metadata: { moduleId },
    };
  }
}

export class FakeMarketplaceProvisioningAdapter implements MarketplaceProvisioningAdapter {
  readonly adapterId = "fake";
  async attachActivationSteps(moduleId: string): Promise<MarketplaceAdapterResult> {
    return {
      adapterId: this.adapterId,
      simulated: true,
      message: `preview sintético de etapas de provisionamento para "${moduleId}"`,
      metadata: { moduleId },
    };
  }
}
