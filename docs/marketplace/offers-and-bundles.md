---
type: reference
status: v1 — fundação
last_updated: 2026-08-06
---

# Ofertas e bundles

## Ofertas (`lib/marketplace/offers.ts`)

`MarketplaceOffer` representa módulo individual, bundle, addon, serviço ou
taxa de implementação. Nunca preço real — `billingPlanIds` (em `metadata`)
é PONTEIRO pro Billing Engine, que continua sendo a fonte de preço.

Ciclo de vida (`status.ts::OFFER_TRANSITIONS`): `draft → active ⇄ disabled
→ archived` (terminal). `createOffer()` nasce sempre `draft`/`enabled:
false`; `activateOffer`/`disableOffer`/`archiveOffer` seguem a tabela —
transição inválida lança `MarketplaceInvalidTransitionError`.

- `validateOfferCompatibility(offer, deploymentPlan)` — compatibilidade
  ESTRUTURAL (plano permitido + oferta ativa), nunca redecide o que o
  Module Engine já resolve por módulo (isso é `eligibility.ts`).
- `evaluateOfferAvailability(offer, tenantId, now?)` — disponibilidade
  temporal (`startsAt`/`endsAt`) + elegibilidade de tenant (visibilidade
  privada). Oferta `internal`/`hidden` nunca disponível pra cliente final.

## Bundles (`lib/marketplace/bundles.ts`)

`MarketplaceBundle` = conjunto de módulos com papel `required`/`optional`,
`incompatibleModules`, plano mínimo e `billingReferenceId`.

- `validateBundle(bundle)` — estrutural: nome, ao menos 1 módulo, módulos
  existem no Module Engine, nenhum módulo é simultaneamente membro E
  incompatível consigo mesmo.
- `expandBundleModules(bundle)` — separa `required`/`optional`.
- `resolveBundleDependencies(bundle)` — resolve `dependsOn` técnico
  (fixed-point, mesma forma de `resolveModuleAvailability`), retorna
  módulos ausentes do Module Engine (nunca deveria acontecer num bundle
  válido).
- `deriveBundleConflicts(bundle)` — módulo listado como incompatível E
  presente no próprio bundle.
- `generateBundlePreview(bundle)` — combina os três acima: blockers
  (dependência ausente, conflito), warnings (módulo `planned` incluído).

### Bundles de demonstração (`createDemoBundles()`)

Nomes NEUTROS e ilustrativos (spec — nunca fixam oferta comercial real da
Brighter): CRM Essencial, CRM + WhatsApp, Omnichannel, Comercial Pro,
Dedicated Operations.
