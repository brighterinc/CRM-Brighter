---
type: architecture
status: v1 — fundação
last_updated: 2026-08-03
---

# Adaptadores de provedor de pagamento

> Complementa [`billing-engine.md`](billing-engine.md). Nenhum adaptador
> desta Foundation chama rede, InfinitePay, Stripe, Mercado Pago, banco,
> Pix, boleto ou cartão.

## Interface (`BillingProviderAdapter`)

```ts
type BillingProviderAdapter = {
  providerId: string;
  createCheckoutPreview(input: { subscription: BillingSubscription }): Promise<BillingProviderResult>;
  createChargePreview(input: { invoice: BillingInvoice }): Promise<BillingProviderResult>;
  cancelChargePreview(input: { invoice: BillingInvoice }): Promise<BillingProviderResult>;
};
```

Mesma forma de `MonitoringAdapter`/`ProvisioningAdapter` — um contrato
abstrato que um adaptador REAL futuro implementaria sem mudar a
assinatura, plugado sem alterar `subscriptions.ts`/`invoices.ts`.

`BillingProviderResult` sempre tem `simulated: true` nesta Foundation —
nunca finge ter chamado um provedor de verdade.

## Adaptadores existentes nesta Foundation

- **`NoopBillingProviderAdapter`** (`providerId: "noop"`) — não integra
  nada; toda chamada devolve uma mensagem explícita "no-op — nenhum
  checkout/cobrança/cancelamento real integrado nesta Foundation".
- **`FakeBillingProviderAdapter`** (`providerId: "fake"`) — determinístico:
  gera `referenceId` sintético derivado do próprio input
  (`fake_chk_<subscriptionId>`, `fake_chg_<invoiceId>`,
  `fake_cancel_<invoiceId>`) — mesmo input sempre produz o mesmo
  `referenceId`, nunca aleatório, nunca I/O real.

Nenhum `InMemoryBillingProviderAdapter` separado foi criado — seria
duplicar a mesma lógica determinística do `FakeBillingProviderAdapter`
(CLAUDE.md anti-pattern #2, "duplicação sem source of truth declarado").

## Explicitamente NÃO implementado nesta Foundation

InfinitePay, Stripe, Mercado Pago, Asaas, qualquer banco, Pix, boleto,
cartão. Um adaptador real desses fica pra uma fase futura (ver
`ROADMAP.md`, "adaptadores reais de billing") — implementando a MESMA
interface `BillingProviderAdapter`, nunca substituindo-a.

## Segurança e privacidade

O Billing Engine **nunca armazena**: número de cartão, CVV, senha, token
de pagamento real, credenciais de gateway, chave Pix completa, dados
bancários completos, documentos pessoais completos, secrets de qualquer
tipo. Pode armazenar só referências futuras SEGURAS e SINTÉTICAS nesta
Foundation: `providerCustomerId`, `providerSubscriptionId`,
`providerInvoiceId`, `paymentMethodType`, `lastFour` (campo
`BillingProviderReference`, `lib/billing/types.ts`) — todas geradas
localmente pelos adaptadores fake/noop acima, nunca vindas de rede.

`sanitizeBillingSubscription`/`sanitizeBillingInvoice`
(`lib/billing/sanitization.ts`) passam `providerRef` por `sanitizeDeep`
mesmo assim — nunca confiar por construção que um valor "já é sintético e
seguro"; a sanitização roda de qualquer forma antes de logar/exportar.
