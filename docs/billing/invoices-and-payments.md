---
type: architecture
status: v1 — fundação
last_updated: 2026-08-03
---

# Invoices e pagamentos — representação de domínio, nunca cobrança real

> Complementa [`billing-engine.md`](billing-engine.md). `BillingInvoice` é
> só uma representação de domínio nesta Foundation — nunca gera boleto,
> Pix, cobrança de cartão ou nota fiscal.

## Sempre em centavos, nunca ponto flutuante

Todo valor monetário é `Money = { amountCents: number; currency: "BRL" }`
(`lib/billing/types.ts`). `pricing.ts` concentra toda aritmética:
`addMoney`/`subtractMoney`/`multiplyMoney`/`sumMoney` nunca operam em reais
com ponto flutuante — só inteiros de centavos, arredondados com
`Math.round`. `subtractMoney` nunca devolve centavos negativos (clampa em
zero) — é a garantia estrutural de "total nunca negativo" (spec §7).

## Estados (`InvoiceStatus`) e transições

```
draft     → open, void
open      → paid, overdue, void, cancelled
overdue   → paid, void, cancelled
paid      → refunded
void      → (terminal)
cancelled → (terminal)
refunded  → (terminal)
```

Toda transição passa por `assertValidInvoiceTransition`
(`lib/billing/status.ts`) — `draft → paid` direto, por exemplo, lança
`InvalidInvoiceTransitionError`.

## Funções (`invoices.ts`)

- **`generateInvoicePreview(subscription, id, now)`** — monta os itens
  recorrentes da assinatura (`subscription.items.filter(i => i.recurring)`),
  calcula totais via `calculateInvoiceTotals` (`pricing.ts`) aplicando os
  `subscription.discounts` vigentes em `now`, e valida a consistência
  (`validateBillingInvoiceInput`) antes de devolver. Nasce sempre `draft`.
- **`openInvoice`/`markInvoicePaid`/`markInvoiceOverdue`/`voidInvoice`/
  `cancelInvoice`/`refundInvoicePreview`** — cada uma só troca `status`
  (e `paidAt` quando aplicável) validando a transição. Nenhuma delas chama
  rede ou gateway — `refundInvoicePreview` é reembolso apenas como
  REPRESENTAÇÃO, nunca uma operação real num provedor.

## Descontos (`BillingDiscount`) e créditos (`BillingCredit`)

- **Percentual** (`type: "percentage"`) — `value` sempre clampado a
  `[0, 100]` antes de aplicar (`applyPercentageDiscount`).
- **Fixo** (`type: "fixed"`) — `value` em centavos, nunca ultrapassa o
  subtotal que está descontando (`applyFixedDiscount`).
- **Múltiplos descontos** se somam (`calculateDiscountTotal`), mas o total
  descontado nunca ultrapassa o subtotal — mesmo com vários descontos
  concorrentes.
- **Janela de validade** (`startsAt`/`endsAt`) é sempre comparada contra o
  `now` recebido por parâmetro — nunca `Date.now()` interno.
- **Crédito** (`BillingCredit`) é aplicado sobre um total já calculado via
  `applyCreditToTotal` — nunca gera total negativo (usa só o crédito
  necessário, `Math.min(total, creditAmount)`).
- **Sem cupom real nesta Foundation** — descontos/créditos são sempre
  objetos de domínio construídos programaticamente (CLI/simulação/teste),
  nunca resgatados de um código externo.

## Referências de provedor — sempre sintéticas

`BillingProviderReference` (`providerCustomerId`/`providerSubscriptionId`/
`providerInvoiceId`/`paymentMethodType`/`lastFour`) é o único lugar onde um
dado "de pagamento" aparece — e nesta Foundation todo valor é gerado
localmente por `FakeBillingProviderAdapter` (ver
[`provider-adapters.md`](provider-adapters.md)), nunca vindo de rede.
**Nunca armazenado**: número de cartão, CVV, senha, token de pagamento real,
credenciais de gateway, chave Pix completa, dados bancários completos,
documento pessoal completo — ver `docs/billing/provider-adapters.md`
§"Segurança e privacidade".

## Imposto nunca é inventado

Não existe campo de imposto em `BillingInvoice` nesta Foundation. Calcular
imposto real (ISS, ICMS, split de marketplace, etc.) é responsabilidade de
uma fase futura com gateway/nota fiscal — nunca um valor "chutado" no
domínio puro.
