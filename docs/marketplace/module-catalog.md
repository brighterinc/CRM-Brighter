---
type: reference
status: v1 — fundação
last_updated: 2026-08-06
---

# Catálogo comercial (`lib/marketplace/catalog.ts`)

O catálogo comercial (`MarketplaceModuleDefinition[]`) é SEPARADO do
`MODULE_CATALOG` técnico (`lib/modules/catalog.ts`), mas cada entrada sempre
referencia um `moduleId` existente lá. `MARKETPLACE_CATALOG_SEED` é só o
insumo comercial (visibilidade, status de publicação, trial, versão,
`billingReferenceId`) — `buildMarketplaceCatalog()` produz o
`MarketplaceModuleDefinition` final, sempre DERIVANDO `allowedPlans` de
`getModuleDefinition(moduleId).allowedPlans`. Nunca escrito à mão.

## Vocabulário comercial

`MarketplaceModuleVisibility`: `public` (catálogo aberto) · `private`
(exige `eligibleTenantIds`) · `internal` (nunca aparece pro cliente final) ·
`hidden`.

`MarketplaceModuleStatus`: `draft` · `active` · `beta` · `planned` ·
`deprecated` · `retired` · `disabled` — eixo comercial, DISTINTO de
`ModuleStatus` técnico (`stable`/`beta`/`planned`). Um módulo pode ser
tecnicamente `stable` e comercialmente `deprecated` (saindo de venda, ainda
funcionando pra quem já tem).

## Validação (`validateMarketplaceCatalog`)

Regras aplicadas contra o Module Engine:

| Situação | Severidade | Efeito |
|---|---|---|
| `moduleId` inexistente no Module Engine | blocker | módulo nunca pode ser publicado |
| Módulo técnico `planned` + comercial `enabled: true` | blocker | nunca comercialmente habilitado |
| Módulo comercial `retired` + `enabled: true` | blocker | retired nunca aceita nova licença |
| Módulo comercial `deprecated` | warning | sai de venda, licenças existentes continuam válidas |
| `visibility: "private"` sem `eligibleTenantIds` | warning | nunca apareceria pra ninguém |
| `requiredModules` referenciando id inexistente | blocker | dependência comercial inválida |

`deriveCatalogBlockers()`/`deriveCatalogWarnings()` filtram por
severidade. O catálogo real (`MARKETPLACE_CATALOG_SEED`) tem zero blocker —
`integration.lumina` (retired) e `integration.sphere` (deprecated)
demonstram os dois estados sem violar a regra.

## Consulta

- `resolveMarketplaceModule(moduleId, catalog?)` — busca por id técnico.
- `listPublicOffers(catalog?)` — só `visibility: "public"` e `enabled`.
- `listTenantEligibleOffers(tenantId, catalog?)` — público sempre, privado
  só se `eligibleTenantIds` incluir o tenant.
