---
type: architecture
status: v1 — fundação
last_updated: 2026-08-03
---

# Ciclo de vida de uma `Installation`

> Estados possíveis e transições de `InstallationStatus`, `CommercialStatus`
> e `TechnicalStatus`. Ver [`control-plane.md`](control-plane.md) pra
> arquitetura completa e [`status.md`](status.md) pro catálogo detalhado de
> cada valor.

## Status da instalação (`InstallationStatus`)

```
planned → provisioning → deploying → waiting_dns → waiting_ssl → waiting_customer → active
                                                                                        ↓
                                                                    maintenance / paused / archived
                                                                                        ↓
                                                                                     error (a qualquer momento)
```

| Status | Categoria | Quando acontece |
|---|---|---|
| `planned` | planning | Instalação registrada na Control Plane, execução ainda não iniciada. |
| `provisioning` | provisioning | Etapas de provisionamento em andamento — corresponde a `ProvisioningRunStatus: "running"` no Provisioning Engine, para as etapas de banco/auth/storage. |
| `deploying` | provisioning | Aplicação sendo publicada no target (Vercel/Cloudflare/VPS). |
| `waiting_dns` | waiting | Bloqueada aguardando o cliente apontar o domínio. |
| `waiting_ssl` | waiting | Domínio já apontado, aguardando emissão/propagação de certificado. |
| `waiting_customer` | waiting | Bloqueada por uma ação pendente do próprio cliente (dado, aprovação, pagamento). |
| `active` | operational | Em produção, operando normalmente. |
| `maintenance` | operational | Intervenção planejada em andamento. |
| `paused` | operational | Suspensa temporariamente (ex.: inadimplência), sem ser cancelamento. |
| `archived` | terminal | Encerrada — não recebe mais atualização nem monitoramento. |
| `error` | terminal | Falha detectada que exige intervenção manual da equipe Brighter. |

Os três status `waiting_*` (`WAITING_INSTALLATION_STATUSES` em `status.ts`)
são os únicos com `isBlocking: true` no catálogo — junto com `error`.

## Status comercial (`CommercialStatus`)

```
lead → proposal → contract → payment_pending → implementation → production
  └──────────────────────── cancelled (a qualquer momento, rank 0) ─────┘
```

| Status | Rank | Nota |
|---|---|---|
| `lead` | 1 | |
| `proposal` | 2 | |
| `contract` | 3 | Marco "negócio fechado" — `COMMERCIAL_STATUS_RANK[x] >= COMMERCIAL_STATUS_RANK.contract`. |
| `payment_pending` | 4 | |
| `implementation` | 5 | |
| `production` | 6 | |
| `cancelled` | 0 | Nunca conta como fechado, mesmo tendo passado por `contract` no passado. |

## Status técnico (`TechnicalStatus`)

```
draft → validated → ready → deploying → running
                                            ↓
                                  warning / failed (fora da escada — podem
                                  acontecer em qualquer estágio "rodando")
```

`warning`/`failed` têm rank `-1` em `TECHNICAL_STATUS_RANK` — nunca
comparáveis com `>=` contra os demais, porque não representam "progresso",
representam um problema detectado independente de em que estágio a
instalação estava.

## Relação Tenant → Deployment → Provisioning → Installation

```
Tenant (lib/tenants/)
  ├─ manifest: DeploymentManifest      ← generateDeploymentManifest() (lib/deployment/)
  └─ consumido por generateProvisioningPlan({ tenant, manifest })
                                        ↓
                              ProvisioningPlan → generateProvisioningSummary()
                                        ↓
                              Installation (lib/control-plane/)
                                ├─ deployment = tenant.manifest (mesma referência)
                                ├─ branding = tenant.branding (mesma referência)
                                ├─ modules = tenant.enabledModules
                                ├─ provisioning = ProvisioningSummary derivado acima
                                └─ status/commercial/technical — SÓ existem aqui,
                                   é a visão de PLATAFORMA que nem Tenant nem
                                   Provisioning Engine carregam
```

Uma `Installation` sempre depende de um `Tenant` com `manifest` já anexado
(via `attachDeploymentManifest`) — `createInstallation`/`updateInstallation`
lançam `TenantMissingManifestError` se não houver.

## Consistência: por que `deployment`/`branding`/`modules` nunca divergem

`validateInstallationInput` (`validation.ts`) compara por **referência**
(`===`), não por valor — `installation.deployment` precisa ser
LITERALMENTE `installation.tenant.manifest`, o mesmo objeto, nunca uma
cópia estruturalmente igual. Isso só é possível porque `repository.ts`
NUNCA aceita esses campos como input: `deriveInstallationFromTenant(tenant)`
sempre os copia por referência a partir do `tenant` recebido. Um chamador
que tentasse montar uma `Installation` manualmente com uma cópia
(`{ ...tenant.manifest }`) falharia a validação — por design, não é uma
checagem "extra", é o que impede a duplicação silenciosa que o
`CLAUDE.md` proíbe (anti-pattern #2, "duplicação sem source of truth
declarado").
