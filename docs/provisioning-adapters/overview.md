---
type: architecture
status: v1 — fundação
last_updated: 2026-08-09
---

# Provisioning Adapters Engine

> Traduz uma etapa ABSTRATA do Provisioning Engine (`lib/provisioning/`) pra
> um **provider concreto** — Supabase, Vercel, DNS, VPS, Docker, Reverse
> Proxy, Redis, Email, WhatsApp, Chatwoot, Evolution, WAHA, Noop, Fake. "Provisioning
> Adapters" é nome interno de código; a tela voltada ao usuário final chama
> isso de "Adaptadores de provisionamento"
> (`/app/settings/provisioning-adapters`).

## Objetivo

Antes desta fundação, o Provisioning Engine já sabia **o que** precisa ser
provisionado, **em qual ordem**, quais dependências/blockers existem, e quais
etapas pertencem a Lite/Pro/Dedicated (`lib/provisioning/catalog.ts`). Faltava
a camada que soubesse **quem executaria** cada etapa — qual provider de
infraestrutura, com quais capabilities, e como simular o resultado sem tocar
infra real.

Esta fundação preenche exatamente isso: um **registry de adapters
blueprint**, um **mapeamento etapa → provider/operação**, um **executor de
dry-run** que respeita a ordem e as dependências do `ProvisioningPlan`, um
**preview de rollback** por provider, e uma **simulação determinística** com
22 cenários nomeados.

## O que esta fundação NÃO faz

- Não cria projeto Supabase, Vercel, VPS, banco, domínio, Redis, Docker,
  Evolution, WAHA ou Chatwoot de verdade.
- Não altera `.env` real, DNS real ou configuração de Caddy real.
- Não faz deploy.
- Não persiste fora de `InMemoryProvisioningAdapterRepository` (memória, por
  chamada).
- Não decide ordem global de execução — isso continua exclusivamente com
  `lib/provisioning/planner.ts`.

`ProvisioningAdapterMode` inclui o literal `"real"` só como tipo RESERVADO —
nenhum construtor desta fundação o usa, e `executeReal()` sempre lança
`RealProvisioningDisabledError`.

## Peças

| Peça | Arquivo | Responsabilidade |
|---|---|---|
| Tipos centrais | `types.ts` | `ProvisioningProvider`, `ProvisioningAdapterRequest/Result`, contrato `ProvisioningProviderAdapter` |
| Capabilities | `capabilities.ts` | Catálogo tipado de operações por provider (nunca executa) |
| Mapeamento etapa→provider | `catalog.ts` | `STEP_ADAPTER_MAP` + `resolveStepAdapterMapping` (considera `target`) |
| Registry | `registry.ts` | `ProvisioningAdapterRegistry` — sem singleton mutável |
| Mapper | `mapper.ts` | `mapProvisioningStepToAdapterRequest` — request sanitizado + idempotency key |
| Executor dry-run | `executor.ts` | `executeProvisioningDryRun` — respeita ordem/deps/blockers |
| Rollback preview | `rollback.ts` | `generateProvisioningRollbackPreview` |
| Repositório | `repository.ts` | `InMemoryProvisioningAdapterRepository` |
| Providers | `providers/*.ts` | 14 blueprints (ver `providers.md`) |
| Simulação | `simulation.ts` | 22 cenários determinísticos (ver `simulation.md`) |
| Resumo | `summary.ts` | `generateProvisioningAdapterSummary` (JSON/Markdown) |
| Integrações | `integrations.ts` | Attach pra Provisioning Engine / Marketplace / Control Plane |

## Ver também

- [`provider-contract.md`](provider-contract.md) — contrato `ProvisioningProviderAdapter`
- [`capabilities.md`](capabilities.md) — catálogo de capabilities por provider
- [`dry-run.md`](dry-run.md) — como o executor resolve/roda cada etapa
- [`rollback.md`](rollback.md) — o que é revertível hoje, o que nunca é
- [`security.md`](security.md) — sanitização, RBAC, garantias "nunca real"
- [`providers.md`](providers.md) — os 14 blueprints
- [`simulation.md`](simulation.md) — os 22 cenários da CLI
- [`docs/provisioning/provisioning-engine.md`](../provisioning/provisioning-engine.md) — fundação consumida (nunca duplicada)
- [`docs/architecture/brighter-platform.md`](../architecture/brighter-platform.md) — mapa completo das fundações
