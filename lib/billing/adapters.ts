/**
 * Adaptadores abstratos de provedor de pagamento — Foundation v1. Nenhum
 * adaptador aqui chama rede, InfinitePay, Stripe, Mercado Pago, banco, Pix,
 * boleto ou cartão. Adaptadores reais ficam pra uma fase futura (ver
 * ROADMAP.md, "adaptadores reais de billing"). Mesma forma de
 * `MonitoringAdapter`/`ProvisioningAdapter`.
 */
import type { BillingInvoice, BillingSubscription } from "./types";

/** Sempre `simulated: true` nesta Foundation — nunca finge ter chamado um provedor de verdade. */
export type BillingProviderResult = {
  providerId: string;
  referenceId: string;
  simulated: true;
  message: string;
  metadata?: Record<string, unknown>;
};

export type BillingProviderAdapter = {
  providerId: string;
  createCheckoutPreview(input: { subscription: BillingSubscription }): Promise<BillingProviderResult>;
  createChargePreview(input: { invoice: BillingInvoice }): Promise<BillingProviderResult>;
  cancelChargePreview(input: { invoice: BillingInvoice }): Promise<BillingProviderResult>;
};

/** Não simula nem sucesso nem preview de verdade — só documenta explicitamente que nada foi integrado. */
export class NoopBillingProviderAdapter implements BillingProviderAdapter {
  readonly providerId = "noop";

  async createCheckoutPreview(_input: { subscription: BillingSubscription }): Promise<BillingProviderResult> {
    return { providerId: this.providerId, referenceId: "noop", simulated: true, message: "no-op — nenhum checkout real integrado nesta Foundation" };
  }

  async createChargePreview(_input: { invoice: BillingInvoice }): Promise<BillingProviderResult> {
    return { providerId: this.providerId, referenceId: "noop", simulated: true, message: "no-op — nenhuma cobrança real integrada nesta Foundation" };
  }

  async cancelChargePreview(_input: { invoice: BillingInvoice }): Promise<BillingProviderResult> {
    return { providerId: this.providerId, referenceId: "noop", simulated: true, message: "no-op — nenhum cancelamento real integrado nesta Foundation" };
  }
}

/** Determinístico e configurável — ids sintéticos derivados do próprio input, nunca I/O real. */
export class FakeBillingProviderAdapter implements BillingProviderAdapter {
  readonly providerId = "fake";

  async createCheckoutPreview(input: { subscription: BillingSubscription }): Promise<BillingProviderResult> {
    return {
      providerId: this.providerId,
      referenceId: `fake_chk_${input.subscription.id}`,
      simulated: true,
      message: `preview de checkout sintético para assinatura "${input.subscription.id}"`,
    };
  }

  async createChargePreview(input: { invoice: BillingInvoice }): Promise<BillingProviderResult> {
    return {
      providerId: this.providerId,
      referenceId: `fake_chg_${input.invoice.id}`,
      simulated: true,
      message: `preview de cobrança sintética para invoice "${input.invoice.id}" — ${input.invoice.total.amountCents} centavos`,
    };
  }

  async cancelChargePreview(input: { invoice: BillingInvoice }): Promise<BillingProviderResult> {
    return {
      providerId: this.providerId,
      referenceId: `fake_cancel_${input.invoice.id}`,
      simulated: true,
      message: `preview de cancelamento sintético para invoice "${input.invoice.id}"`,
    };
  }
}
