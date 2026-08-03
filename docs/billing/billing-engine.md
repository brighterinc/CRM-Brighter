---
type: architecture
status: v1 — fundação
last_updated: 2026-08-03
---

# Brighter Billing Engine

> Fundação que representa o domínio COMERCIAL/FINANCEIRO de cada instalação
> White Label: plano contratado, assinatura, ciclo, itens, módulos
> licenciados, consumo, limites, créditos, descontos, upgrade/downgrade,
> suspensão, cancelamento, inadimplência, renovação e entitlement de
> módulo. Consome `Installation` da Control Plane (`lib/control-plane/`) —
> nunca reimplementa `Tenant`/`DeploymentManifest`/`ProvisioningSummary`/
> catálogo de módulos. "Billing Engine" é nome interno de código; a tela
> voltada ao usuário final chama isso de "Faturamento"
> (`/app/settings/billing`).

## Objetivo

Antes desta fundação, nenhuma peça sabia responder "qual plano COMERCIAL o
cliente contratou, e ele está em dia?" — o Deployment/Module Engine sabem
o plano TÉCNICO (`lite`/`pro`/`dedicated`) e a compatibilidade de módulo; a
Control Plane sabe o estágio operacional da instalação; o Monitoring sabe
a saúde técnica. Faltava o eixo FINANCEIRO: assinatura, ciclo, invoice,
consumo vs. limite, desconto/crédito, e a pergunta final — "a instalação
deve continuar ativa, entrar em grace period ou ser suspensa
financeiramente?". O Billing Engine resolve isso permanecendo — como toda
fundação anterior — uma camada de domínio pura: sem gateway, sem cobrança
real, sem persistência real, sem checkout, sem nota fiscal.

## Plano técnico x plano comercial — a distinção central

- **Plano técnico** (`DeploymentPlan` = `"lite" | "pro" | "dedicated"`,
  `lib/modules/catalog.ts`) — decide infraestrutura e compatibilidade de
  módulo. Já existe desde o Module/Deployment Engine; o Billing Engine
  NUNCA redefine isso.
- **Plano comercial** (`BillingPlanDefinition`, `lib/billing/catalog.ts`) —
  o que é VENDIDO: preço (placeholder nesta Foundation), ciclos permitidos,
  módulos incluídos/extras, limites contratados, grace period, elegibilidade
  de upgrade/downgrade. Cada plano comercial referencia um `deploymentPlan`
  — nunca inventa compatibilidade de módulo por conta própria
  (`validateBillingPlanDefinition` garante isso).

## Princípios (mesma doutrina das fundações anteriores)

- **Camada de domínio, não CRUD.** Tipos, catálogo, pricing puro,
  validação, máquina de estados de assinatura/invoice, entitlements,
  consumo, eventos, repositório in-memory, adaptadores fake/noop,
  simulação, resumo — nunca uma API REST nova, nunca uma tabela, nunca uma
  Edge Function, nunca gateway/banco/Pix/boleto/nota fiscal reais.
- **Consome `Installation`, nunca duplica módulo/plano técnico/tenant.**
  `resolveBillingEntitlements`/`generateBillingSummary` recebem sempre o
  necessário derivado de `Installation` (`lib/control-plane/types.ts`) — a
  mesma doutrina de "nunca aceitar tenant/manifest soltos" que Control
  Plane e Monitoring já seguem.
- **Módulo `status: "planned"` nunca é autorizado**, mesmo se comercialmente
  incluído; módulo fora de `allowedPlans` do `deploymentPlan` nunca é
  autorizado — o Billing só pode NEGAR o que o Module Engine já decidiu,
  nunca CONCEDER além disso (`DISABLED_MODULES` mantém precedência
  operacional).
- **Assinatura suspensa/cancelada nunca remove dado.** Produz só
  `financialRecommendation` (recomendação) — nenhuma função do Billing
  Engine desliga módulo, arquiva instalação ou apaga registro de verdade.
  Módulos `core.*` permanecem autorizados em modo restrito mesmo suspensos
  (ver [`entitlements-and-limits.md`](entitlements-and-limits.md)).
- **Nunca ponto flutuante em dinheiro.** Tudo em centavos (`Money.amountCents`),
  sempre BRL nesta Foundation. Total de invoice nunca negativo; desconto
  nunca ultrapassa o subtotal que está descontando.
- **Sem persistência real.** Só existe `InMemoryBillingRepository` — mesma
  doutrina das seis fundações anteriores.
- **Nenhuma dependência da Lumina.** Nenhum arquivo de `lib/billing/*` lê,
  escreve ou referencia `/opt/brighter-lumina` (porta 8000).

## Arquitetura

```
lib/billing/
  types.ts          — vocabulário + BillingPlanDefinition/Subscription/Invoice/Event
  status.ts          — arrays fechados, transições de SubscriptionStatus/InvoiceStatus, recommendInstallationAction()
  catalog.ts         — BILLING_PLAN_CATALOG (Lite/Pro/Dedicated) + getBillingPlanDefinition()
  pricing.ts          — aritmética monetária em centavos, descontos, calculateInvoiceTotals()
  validation.ts        — validateBillingPlanDefinition()/validateBillingSubscriptionInput()/validateBillingInvoiceInput()/validateBillingDiscount()
  subscriptions.ts      — createSubscription()...expireGracePeriod() (máquina de estados)
  usage.ts               — evaluateUsageAgainstLimits()/suggestPlanUpgrade()
  entitlements.ts          — resolveBillingEntitlements()
  invoices.ts               — generateInvoicePreview()...refundInvoicePreview()
  events.ts                  — createBillingEvent()/deriveBillingEvents()/summarizeBillingEvents()
  sanitization.ts              — reexporta sanitizeDeep (lib/tenants/export.ts) — nunca reimplementa
  adapters.ts                   — BillingProviderAdapter, NoopBillingProviderAdapter, FakeBillingProviderAdapter
  repository.ts                  — BillingRepository + InMemoryBillingRepository + createDemoBillingSubscriptions()
  summary.ts                      — generateBillingSummary(), integração com a Control Plane
  simulation.ts                    — simulateBillingScenario() (22 cenários determinísticos)
  index.ts                          — barrel público (export *)

app/app/settings/billing/page.tsx   — tela admin-only, somente leitura
scripts/generate-billing-summary.ts  — CLI (pnpm billing:summary)
```

Assim como `lib/monitoring/`, **nenhum arquivo de `lib/billing/*` lê
`process.env`** — `sanitization.ts` importa `sanitizeDeep` de
`@/lib/tenants/export` diretamente (nunca o barrel `@/lib/tenants`).

## Catálogo comercial (`catalog.ts`)

Três planos — Lite, Pro, Dedicated — cada um com `basePrice.amountCents: 0`
(placeholder de demonstração desta Foundation; o preço comercial real será
configurado futuramente na Control Plane, ver ROADMAP.md). `includedModules`
são módulos sem custo extra; `optionalModules` são extras pagos (ex.:
`ai.agents`/`ai.memory`/`ai.rag` como extra no Lite; `integration.nuvemshop`
no Pro). Ver [`entitlements-and-limits.md`](entitlements-and-limits.md).

## Assinatura (`subscriptions.ts`) e invoice (`invoices.ts`)

Ver [`subscription-lifecycle.md`](subscription-lifecycle.md) e
[`invoices-and-payments.md`](invoices-and-payments.md).

## Entitlements e limites (`entitlements.ts`/`usage.ts`)

Ver [`entitlements-and-limits.md`](entitlements-and-limits.md).

## Adaptadores (`adapters.ts`)

Ver [`provider-adapters.md`](provider-adapters.md).

## Eventos (`events.ts`)

`BillingEvent` é só uma linha de auditoria/timeline em memória — nunca
dispara webhook real. `deriveBillingEvents` deriva eventos a partir de
transições OBSERVADAS (assinatura, invoice, consumo), nunca "do nada".
`summarizeBillingEvents` agrupa por tipo e acha o mais recente.

## Resumo (`summary.ts`) e integração com a Control Plane

`generateBillingSummary(installation, subscription, ...)` — view model JSON
com plano, ciclo, status, módulos incluídos/extras/não-autorizados,
warnings/blockers de consumo, sugestão de upgrade e
`financialRecommendation`. `renderBillingSummaryMarkdown` — mesmo estilo
Markdown das CLIs anteriores.

`attachBillingSummaryToInstallationSummary(installation, subscription)` e
`generateBillingControlPlaneOverview(installations, subscriptionByInstallationId)`
respondem as perguntas agregadas da Control Plane (instalações ativas,
trials, inadimplentes, em grace period, suspensas, canceladas, sem
assinatura, aguardando ação financeira) — **sem alterar nenhum arquivo de
`lib/control-plane/*`**. A tela `/app/settings/control-plane` poderia
consumir essas funções no futuro; por ora a tela de Faturamento fica
isolada (`/app/settings/billing`).

### Separação Billing x Monitoring

`lib/billing/summary.ts` NUNCA importa `MonitoringSnapshot`/
`MonitoringIncident` (`lib/monitoring/types.ts`), e nenhum arquivo de
`lib/monitoring/*` importa nada de `lib/billing/*`. Uma instalação
`suspended` financeiramente NÃO é um incidente técnico — é uma
`InstallationFinancialRecommendation` (`status.ts::recommendInstallationAction`).
Uma instalação `unhealthy` no Monitoring NÃO é inadimplência. Os dois view
models (`InstallationMonitoringOverview`/`InstallationBillingOverview`)
convivem lado a lado na Control Plane sem se misturar — testado
estruturalmente em `tests/unit/billing-summary.test.ts`.

## Simulação (`simulation.ts`)

`simulateBillingScenario(installation, scenario, now)` — 22 cenários
determinísticos: `lite-active`, `pro-active`, `dedicated-active`, `trial`,
`invoice-paid`, `invoice-overdue`, `payment-failed`, `grace-period`,
`suspension-recommended`, `reactivation`, `upgrade-lite-to-pro`,
`upgrade-pro-to-dedicated`, `downgrade-dedicated-to-pro`, `extra-module`,
`usage-warning`, `usage-at-limit`, `usage-exceeded`, `cancel-at-period-end`,
`cancel-immediate`, `discount-percentage`, `discount-fixed`, `credit`.

## Tela `/app/settings/billing`

Server Component admin-only, mesmo guard de
`/app/settings/monitoramento`/`/app/settings/control-plane`
(`requireAuth()` + `resolveActiveOrg()` +
`ROLE_RANK[...] >= ROLE_RANK.admin` OU `is_platform_admin`, senão
`redirect("/403")`). Somente leitura — sem botão de cobrança real. Mostra:
instalação atual, plano técnico e comercial, situação financeira, ciclo,
período atual, módulos incluídos/extras/não-autorizados, blockers,
warnings, sugestão de upgrade e o mesmo Markdown que a CLI gera. Usa uma
assinatura de demonstração (`createDemoBillingSubscriptions`) — nesta
Foundation não existe assinatura real persistida.

## CLI (`pnpm billing:summary`)

```bash
pnpm billing:summary -- --client "Empresa Exemplo" --slug empresa-exemplo \
  --domain crm.empresa.com.br --plan pro \
  --modules core.contacts,core.pipeline,channel.email \
  --scenario active --format markdown
```

Cenários aceitos (mapeados internamente pro cenário de
`lib/billing/simulation.ts`): `active`, `trial`, `past-due`,
`grace-period`, `suspended`, `cancelled`, `upgrade`, `downgrade`,
`usage-warning`, `usage-exceeded`, `payment-failed`. Sai com código != 0
apenas em `suspended`/`cancelled` — os dois cenários documentados como
críticos.

## Relação com as fundações anteriores

```
White Label Runtime → Module Engine → Deployment Engine → Tenant Engine → Provisioning Engine → Control Plane
                                                                                                        ↓ observado por
                                                                                              Monitoring Engine
                                                                                                        ↓ licenciado/cobrado por
                                                                                                 Billing Engine
```

Nunca duplica: reusa o agregado `Installation` da Control Plane, o
`DeploymentPlan`/`MODULE_CATALOG` do Module/Deployment Engine e o
sanitizador do Tenant Engine. Ver mapa completo em
[`docs/architecture/brighter-platform.md`](../architecture/brighter-platform.md).

## Limitações da Foundation v1

- **Nenhuma cobrança real** — nenhum adaptador de `lib/billing/adapters.ts`
  chama InfinitePay, Stripe, Mercado Pago, banco, Pix, boleto ou cartão.
- **Não gera nota fiscal, não calcula imposto real.**
- **Não persiste nada de verdade** — `InMemoryBillingRepository` vive só na
  memória do processo.
- **Não bloqueia nada por consumo** — `usage.ts` só avisa/recomenda
  (`deriveUsageWarnings`/`deriveUsageBlockers`), nunca impede uma ação.
- **Não notifica, não abre ticket externo, não envia webhook real** —
  eventos ficam só no `BillingRepository` em memória.
- **Não executa suspensão real de instalação** — `recommendInstallationAction`
  só recomenda; a suspensão técnica de verdade (se um dia existir) seria
  responsabilidade de uma camada de execução futura, nunca deste Foundation.

## Confirmação: esta versão não cobra ninguém

Nenhum arquivo de `lib/billing/*` chama rede, gateway de pagamento, banco,
gera boleto/Pix/nota fiscal, cria migration, cron ou worker. A tela e a
CLI são puramente leitura/simulação. Nenhuma peça deste engine acessa
`/opt/brighter-lumina` ou a porta 8000.
