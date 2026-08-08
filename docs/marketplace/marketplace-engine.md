---
type: architecture
status: v1 — fundação
last_updated: 2026-08-06
---

# Brighter Marketplace / Module Licensing Engine

> Fundação que modela a OFERTA COMERCIAL de módulos e o ESTADO DA LICENÇA de
> cada módulo por instalação: catálogo comercial, ofertas, bundles,
> licenças, trials, elegibilidade, entitlement, plano de ativação teórico e
> versionamento — como domínio puro de simulação determinística, sem ativar
> nenhum módulo de verdade. Consome (nunca duplica) `Installation` da
> Control Plane, `MODULE_CATALOG` do Module Engine e `resolveBillingEntitlements`
> do Billing Engine. "Marketplace / Module Licensing Engine" é nome interno
> de código; a tela voltada ao usuário final chama isso de "Módulos e
> licenças" (`/app/settings/modulos-licencas`).

## Module Engine × Billing × Marketplace — quem é dono de quê

Três sistemas, três responsabilidades, nunca confundir:

| | Module Engine (`lib/modules/`) | Billing Engine (`lib/billing/`) | Marketplace (esta Foundation) |
|---|---|---|---|
| Responde | "este módulo FUNCIONA nesta instalação?" | "esta instalação PAGA por este módulo?" | "esta instalação tem DIREITO COMERCIAL de licenciar este módulo?" |
| Fonte de | requisitos técnicos, planos permitidos, dependências, `ENABLED_MODULES`/`DISABLED_MODULES` | preço, ciclo, assinatura, invoice, entitlement financeiro | catálogo comercial, ofertas, bundles, licenças, trials, ativação teórica |
| Nunca decide | preço, direito comercial | requisito técnico, compatibilidade | preço (referencia `billingPlanId`/`billingItemId`, nunca calcula), requisito técnico |
| Precedência | TÉCNICA — vence sempre | FINANCEIRA — só pode NEGAR o que o Module Engine já autorizou | CONSOLIDA os dois — nunca concede além de nenhum dos dois |

O Marketplace nunca concede tecnicamente o que o Module Engine não permite,
e nunca concede financeiramente o que o Billing já negou. Ele adiciona um
QUINTO eixo de status — `LicenseStatus` — distinto de `ModuleStatus`
(técnico), `SubscriptionStatus` (financeiro), `InstallationStatus`
(plataforma) e `TenantCommercialStatus`/`TenantTechnicalStatus` (o que o
cliente vive), mesma doutrina documentada no cabeçalho de
`lib/billing/types.ts`.

## Objetivo

Antes desta fundação, "módulo comprável" só existia implicitamente via
`ENABLED_MODULES`/`DISABLED_MODULES` (Module Engine) e `includedModules`/
`optionalModules` de um `BillingPlanDefinition` (Billing Engine) — nenhuma
representação de OFERTA (catálogo com visibilidade/status de publicação),
nenhuma noção de LICENÇA/TRIAL por tenant, nenhum plano de ativação
teórico. O Marketplace resolve isso permanecendo — como toda fundação
anterior — uma camada de domínio pura.

## Princípios

- **Camada de domínio, não CRUD.** Nunca uma API REST nova, nunca uma
  tabela, nunca uma Edge Function, nunca ativação real de módulo.
- **`MarketplaceModuleDefinition.moduleId` sempre referencia `MODULE_CATALOG`.**
  `allowedPlans`/`requiredModules` são DERIVADOS do Module Engine
  (`catalog.ts::buildMarketplaceCatalog`), nunca redeclarados por valor —
  divergência é estruturalmente impossível, não "lembrada por quem edita".
- **Módulo `planned` nunca licenciável em produção.** Mesma regra de
  `resolveBillingEntitlements`/`validateWorkflowDefinition`.
- **Módulo `retired` nunca aceita nova licença.** Licença existente
  continua existindo (histórico), mas `createLicense`/`createTrial` novos
  são recusados.
- **Trial nunca passa por Billing.** Um trial ativo — ou uma licença nascida
  de `convertTrialToLicense` — autoriza independente do gate financeiro; só
  a checagem TÉCNICA (Module Engine) pode negar um trial.
- **Suspensão/expiração nunca remove dado.** `core.*` permanece acessível em
  modo restrito, mesma política do Billing Engine.
- **Plano de ativação é sempre teórico.** `generateModuleActivationPlan`
  nunca ativa módulo, nunca edita `.env`, nunca faz deploy.
- **Sem persistência real.** Só existe `InMemoryMarketplaceRepository`.
- **Nenhuma dependência da Lumina.**

## Arquitetura

```
lib/marketplace/
  types.ts          — MarketplaceModuleDefinition/MarketplaceOffer/MarketplaceBundle/ModuleLicense/ModuleTrial/etc.
  status.ts         — tabelas de transição válida (licença/trial/oferta)
  catalog.ts         — buildMarketplaceCatalog/validateMarketplaceCatalog/resolveMarketplaceModule/listPublicOffers
  offers.ts            — createOffer..archiveOffer, validateOfferCompatibility, evaluateOfferAvailability
  bundles.ts              — validateBundle/expandBundleModules/resolveBundleDependencies/generateBundlePreview
  licenses.ts                — createLicense..revokeLicense/renewLicense/convertTrialToLicense
  trials.ts                     — createTrial..convertTrial
  eligibility.ts                   — evaluateModuleEligibility()
  entitlements.ts                     — resolveMarketplaceEntitlements()
  activation.ts                          — generateModuleActivationPlan()
  versioning.ts                             — compareVersions/planVersionUpgrade/planVersionDowngrade
  validation.ts                                — validação estrutural (licença/trial/oferta)
  history.ts                                      — ModuleLicenseHistoryEntry
  repository.ts                                      — MarketplaceRepository + InMemoryMarketplaceRepository
  adapters.ts                                           — ModuleActivationAdapter/BillingAdapter/ProvisioningAdapter (Noop/Fake)
  integrations.ts                                          — Billing entitlement, Monitoring saúde, Provisioning/Control Plane attach
  simulation.ts                                               — simulateMarketplaceScenario() (26 cenários determinísticos)
  sanitization.ts                                                — reexporta sanitizeDeep — nunca reimplementa
  summary.ts                                                        — generateMarketplaceSummary()
  index.ts                                                             — barrel público (export *)

app/app/settings/modulos-licencas/page.tsx  — tela admin-only, somente leitura
scripts/generate-marketplace-summary.ts     — CLI (pnpm marketplace:summary)
```

Nenhum arquivo de `lib/marketplace/*` lê `process.env` — `sanitization.ts`
importa `sanitizeDeep` de `@/lib/tenants/export` diretamente, mesmo cuidado
documentado em `lib/billing/index.ts`/`lib/outreach/index.ts`.

## Documentos relacionados

- [`module-catalog.md`](module-catalog.md) — catálogo comercial e sua
  validação contra o Module Engine
- [`offers-and-bundles.md`](offers-and-bundles.md) — ofertas e bundles
- [`licenses.md`](licenses.md) — ciclo de vida de `ModuleLicense`
- [`trials.md`](trials.md) — ciclo de vida de `ModuleTrial`
- [`entitlements.md`](entitlements.md) — elegibilidade e entitlement
- [`activation-plans.md`](activation-plans.md) — plano de ativação teórico
- [`versioning.md`](versioning.md) — versionamento e upgrade/downgrade
- [`simulation.md`](simulation.md) — os 26 cenários de
  `simulateMarketplaceScenario`

## Relação com as fundações anteriores

```
White Label Runtime → Module Engine → Deployment Engine → Tenant Engine → Provisioning Engine → Control Plane
                                                                                                        ↓ licenciado/cobrado por
                                                                                                 Billing Engine
                                                                                                        ↓ ofertado/licenciado por
                                                                                              Marketplace Engine
```

Nunca duplica: reusa o agregado `Installation` da Control Plane, o
`MODULE_CATALOG` do Module Engine e `resolveBillingEntitlements` do Billing
Engine. Ver mapa completo em
[`docs/architecture/brighter-platform.md`](../architecture/brighter-platform.md).

## Limitações da Foundation v1

- **Nenhuma ativação real** — `adapters.ts` só tem implementações
  `Noop`/`Fake`; nenhum adaptador altera `ENABLED_MODULES`/`.env`.
- **Nenhuma cobrança real** — Marketplace nunca calcula preço, nunca cria
  invoice, nunca chama gateway; sempre referencia `billingPlanId`/
  `billingItemId` como ponteiro.
- **Nenhum provisionamento real** — `attachMarketplaceActivationToProvisioningPlan`
  produz view model, nunca escreve num `ProvisioningPlan` real.
- **Não persiste nada de verdade** — `InMemoryMarketplaceRepository` vive só
  na memória do processo.

## Confirmação: esta versão não executa nada de verdade

Nenhum arquivo de `lib/marketplace/*` chama rede, ativa módulo real, cobra,
provisiona infraestrutura ou grava em tabela real. A tela e a CLI são
puramente leitura/simulação. Nenhuma peça deste engine acessa
`/opt/brighter-lumina` ou a porta 8000.
