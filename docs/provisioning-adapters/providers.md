---
type: reference
status: v1 — fundação
last_updated: 2026-08-09
---

# Os 14 blueprints de provider

Todos em `lib/provisioning-adapters/providers/`, construídos via
`providers/base.ts` (ver `provider-contract.md`). Nenhum chama rede, Docker,
shell ou filesystem externo.

| Arquivo | `providerId` | Fábrica |
|---|---|---|
| `noop.ts` | `noop` | `createProvisioningProviderAdapter` — nunca finge sucesso "de verdade" |
| `fake.ts` | `fake` | `createProvisioningProviderAdapter` — determinístico, ecoa `request.input` |
| `supabase.ts` | `supabase` | tabelada — 7 operações |
| `vercel.ts` | `vercel` | tabelada — 4 operações |
| `dns.ts` | `dns` | tabelada — 4 operações |
| `vps.ts` | `vps` | tabelada — 3 operações |
| `docker.ts` | `docker` | tabelada — 4 operações |
| `reverse-proxy.ts` | `reverse_proxy` | tabelada — 2 operações |
| `redis.ts` | `redis` | tabelada — 2 operações |
| `email.ts` | `email` | tabelada — 2 operações |
| `whatsapp.ts` | `whatsapp` | tabelada — 2 operações (canal genérico) |
| `chatwoot.ts` | `chatwoot` | tabelada — 2 operações (sem etapa própria no catálogo) |
| `evolution.ts` | `evolution` | tabelada — 2 operações (sem etapa própria no catálogo) |
| `waha.ts` | `waha` | tabelada — 1 operação (sem etapa própria no catálogo) |

## Registry padrão

`providers/index.ts::createDefaultProvisioningAdapterRegistry()` monta um
`ProvisioningAdapterRegistry` NOVO a cada chamada, com os 14 registrados na
ordem canônica de `PROVISIONING_PROVIDERS` — nunca um singleton global
mutável (spec §5). CLI, página admin e testes chamam essa fábrica sempre
que precisam de um registry "cheio".

## Exemplo — `SupabaseProvisioningProviderAdapter`

```ts
export const SupabaseProvisioningProviderAdapter = createTableDrivenProvisioningProviderAdapter("supabase", {
  "project.create": {
    message: "Criaria o projeto Supabase (Auth + Postgres) desta instalação.",
    rollback: ["remover projeto Supabase (só se criado exclusivamente por esta execução)"],
  },
  // ...
});
```

Sabe quais operações suportaria (`capabilities()`), quais inputs exige
(`validate`), como gerar dry-run (`dryRun`) e como gerar rollback preview
(`rollbackPreview`) — mas nunca chama `api.supabase.com`.
