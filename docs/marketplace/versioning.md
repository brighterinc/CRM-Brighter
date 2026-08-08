---
type: reference
status: v1 — fundação
last_updated: 2026-08-06
---

# Versionamento (`lib/marketplace/versioning.ts`)

Compara versões `MAJOR.MINOR.PATCH` (SemVer simplificado — sem
pre-release/build metadata). Nunca executa migration real; toda função
produz só um PLANO.

## `compareVersions(a, b)`

Retorna `-1`/`0`/`1`, ou `null` quando alguma versão não é SemVer válido
(`MAJOR.MINOR.PATCH`, todos números).

## `evaluateVersionCompatibility(moduleId, from, to)`

Deriva `changeKind` (`upgrade`/`downgrade`/`none`) a partir da comparação.
Avisa (nunca bloqueia) em mudança de MAJOR version — upgrade pode exigir
migration de dados; downgrade pode não ser reversível sem perda de
configuração.

## `planVersionUpgrade(license, toVersion)` / `planVersionDowngrade(...)`

Bloqueia se a direção pedida não bater com o `changeKind` real (ex.: pedir
upgrade pra uma versão menor). `requiresMigration` é derivado dos warnings
de `evaluateVersionCompatibility` (mudança de MAJOR). Retorna
`MarketplaceVersionPlan` com `recommendation` legível — nunca executa a
migration, só sinaliza que ela seria necessária.

## `deriveVersionWarnings(marketplaceModule, license)`

Avisa quando:
- a versão da licença é anterior à versão atual do catálogo (desatualizada);
- o módulo está `deprecated` na versão atual.

## Regra

Versionamento nesta Foundation é PURO SINAL — nenhuma migration de schema,
nenhuma troca de código, nenhum redeploy é executado. `requiresMigration:
true` é uma recomendação pra uma fase futura decidir como executar.
