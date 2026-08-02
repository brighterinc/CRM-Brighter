---
type: architecture
status: v1 — fundação
last_updated: 2026-08-02
---

# Ciclo de vida do Tenant

> Guia dos ciclos comercial e técnico de um `Tenant` (Brighter Tenant
> Engine) e da diferença entre as três coisas que este repositório chama de
> "tenant"/"organização" em contextos diferentes. Isto é documentação de
> **guia**, não máquina de estado imposta em código — a Foundation v1 não
> valida transição entre status, só o estado atual (ver
> [`tenant-engine.md`](tenant-engine.md) §Limitações).

## As três coisas que NÃO são a mesma coisa

O repositório usa palavras parecidas ("tenant", "organização") em três
níveis de abstração bem diferentes. Confundir um com outro é o erro mais
provável de quem lê este código pela primeira vez:

| # | Nome | O que é | Onde vive | Quem gerencia |
|---|---|---|---|---|
| 1 | **`Tenant` (Tenant Engine, este doc)** | Uma instalação White Label INTEIRA — 1 cliente da Brighter → 1 Supabase próprio → 1 domínio → 1 deploy | `lib/tenants/types.ts` (não persistido nesta Foundation) | Futura Control Plane, hoje nada |
| 2 | **"tenant" em `/admin/tenants`** | Uma linha de `organizations` — um cliente multi-tenant DENTRO de uma única instalação do DeskcommCRM | tabela `organizations`, `app/admin/(protected)/tenants/`, `app/api/v1/admin/tenants/`, `hooks/useAdminTenants.ts` (`AdminTenantRow`) | Platform admin da instalação (`is_platform_admin`), via `/admin/tenants` |
| 3 | **Organização interna do CRM** | Mesma tabela `organizations` que #2, vista do lado do usuário comum (`/app/settings/tenant` — "Organização": dados da empresa, DPO, retenção) | mesma tabela `organizations`, RLS por `fn_user_org_ids()` | Admin da própria organização, via `/app/settings/tenant` |

Ou seja: **#2 e #3 são a MESMA entidade** (uma linha de `organizations`)
vista de dois ângulos — o platform admin gerenciando de fora (#2) e o admin
da própria empresa gerenciando de dentro (#3). **#1 é um nível acima de
ambos**: uma instalação inteira do DeskcommCRM pode ter VÁRIAS organizações
(#2/#3) rodando dentro dela (é o multi-tenant via RLS que o CLAUDE.md
descreve como "arquitetura multi-tenant desde o dia 1"), mas cada tenant
White Label (#1) tem sua PRÓPRIA instalação, seu PRÓPRIO Supabase — nunca
duas instalações compartilhando organizações.

```
Tenant (#1, Brighter Tenant Engine)
  = 1 instalação inteira do DeskcommCRM (1 Supabase, 1 domínio, 1 deploy)
    └── organizations (#2 visto de fora / #3 visto de dentro) — 1 ou mais,
        compartilhando o MESMO banco/instalação, isoladas por RLS
        └── user_organizations, crm_leads, conversations, etc.
```

Um exemplo concreto ajuda: a Brighter vende o DeskcommCRM White Label pra
uma rede de clínicas (Tenant #1 — 1 instalação, 1 Supabase, domínio
`crm.clinica-exemplo.com.br`). Dentro dessa instalação, a rede pode ter
múltiplas unidades cadastradas como `organizations` diferentes (#2/#3) — a
Unidade Centro e a Unidade Zona Sul, cada uma com seus próprios leads,
conversas e equipe, isoladas por RLS, mas rodando no MESMO banco/instalação
porque são a MESMA empresa cliente da Brighter.

## Ciclo comercial (`TenantCommercialStatus`)

```
lead → proposal → contracted → onboarding → active ⇄ suspended
                                                  ↘ cancelled
```

| Status | Significado |
|---|---|
| `lead` | Prospect identificado, sem proposta formal ainda |
| `proposal` | Proposta comercial enviada/em negociação |
| `contracted` | Contrato assinado — a partir daqui, `evaluateTenantReadiness` considera "contrato confirmado" satisfeito |
| `onboarding` | Em processo de configuração/implantação |
| `active` | Instalação em operação, contrato vigente |
| `suspended` | Pausado (inadimplência, decisão do cliente) — herda o rank de `active` no `COMMERCIAL_STATUS_RANK` (era ativo, só está pausado) |
| `cancelled` | Encerrado — nunca conta como "contrato confirmado", mesmo tendo passado por `contracted` no passado (`COMMERCIAL_STATUS_RANK.cancelled === 0`) |

## Ciclo técnico (`TenantTechnicalStatus`)

```
draft → configuration_pending → ready_to_provision → provisioning → validation → live ⇄ degraded
                                                                                      ↘ archived
```

| Status | Significado |
|---|---|
| `draft` | Tenant esboçado, dados incompletos |
| `configuration_pending` | Faltam dados de configuração (branding, infra, Supabase) |
| `ready_to_provision` | `evaluateTenantReadiness(tenant).blockers.length === 0` — só deveria ser marcado quando os blockers forem zero (a readiness emite **warning** se este status estiver setado com blockers pendentes) |
| `provisioning` | Infraestrutura sendo criada (fora do escopo desta Foundation — futuro) |
| `validation` | Instalação criada, em checagem antes de ir ao ar |
| `live` | Em operação — exige referência de infraestrutura válida e manifesto de implantação válido (a readiness emite **warning** se `live` sem isso) |
| `degraded` | Em operação com problema conhecido |
| `archived` | Desativado permanentemente |

## Readiness não é máquina de estado

`evaluateTenantReadiness` calcula um **snapshot** do que falta agora — ela
não impede, por exemplo, um tenant pular de `draft` direto pra `live` no
campo `technicalStatus`. O que ela faz é sinalizar a inconsistência como
**warning** (nunca blocker, nunca bloqueia nada): "status técnico
`ready_to_provision` mas há N bloqueio(s) pendente(s)" ou "status técnico
`live` mas infraestrutura/manifesto incompletos". Impor a máquina de estado
de verdade (transições permitidas, quem pode mudar o quê) é trabalho da
futura Control Plane, não desta Foundation.

## Isolamento por plano

| Plano | Isolamento |
|---|---|
| **Lite** | 1 tenant → 1 deploy próprio (Vercel/Cloudflare) → 1 projeto Supabase próprio. Sem VPS. |
| **Pro** | Mesmo isolamento do Lite — deploy hospedado, Supabase próprio, sem VPS obrigatória. |
| **Dedicated** | 1 tenant → 1 VPS dedicada, exclusiva — nunca compartilhada entre clientes, nunca a mesma VPS de outra aplicação crítica não relacionada (ver `docs/architecture/brighter-platform.md` §"Nenhuma dependência direta da Lumina"). |

Em todos os planos: **nunca duas instalações compartilham banco**. O
multi-tenant via RLS (organizações #2/#3 acima) só existe DENTRO de uma
mesma instalação — nunca entre tenants White Label diferentes.

## Nenhuma persistência nesta Foundation

`InMemoryTenantRepository` é demonstração/teste — cada instância some ao
fim do processo. Não existe tabela `tenants` no Postgres, não existe
migration para isso, e não deveria: persistir tenant de verdade implica
decidir ONDE (não faz sentido morar dentro do banco de UM cliente White
Label — um tenant descreve o CONJUNTO de instalações da Brighter, não uma
delas). Isso é trabalho da futura **Control Plane** — um serviço/banco
separado, fora de qualquer instalação individual de cliente, que a Brighter
operaria pra gerenciar seu catálogo de clientes White Label. Ver `ROADMAP.md`.

## Proibição de guardar segredo

Nenhum tipo do Tenant Engine tem campo pra `service_role key`, senha de
banco, connection string, token, API key ou chave SSH — nem hoje, nem na
futura Control Plane (quando ela existir, vai seguir a mesma doutrina: só
nome de recurso, ID externo, URL pública, status, metadado). Ver
`lib/tenants/export.ts` (`sanitizeDeep`) e
`tests/unit/tenant-export.test.ts` para a defesa em profundidade contra
propriedade extra "suja" em runtime.
