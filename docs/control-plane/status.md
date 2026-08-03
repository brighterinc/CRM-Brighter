---
type: reference
status: v1 — fundação
last_updated: 2026-08-03
---

# Catálogo de status da Control Plane

> Referência rápida dos três vocabulários de status de `Installation` e dos
> metadados que `lib/control-plane/catalog.ts` anexa a cada um. Ver
> [`lifecycle.md`](lifecycle.md) pras transições e [`control-plane.md`](control-plane.md)
> pra arquitetura completa.

## `InstallationStatus` (11 valores)

| id | Label | Categoria | Bloqueante | Descrição |
|---|---|---|---|---|
| `planned` | Planejada | planning | não | Instalação registrada, ainda sem execução iniciada. |
| `provisioning` | Provisionando | provisioning | não | Etapas de provisionamento em andamento (banco, auth, storage). |
| `deploying` | Implantando | provisioning | não | Aplicação sendo publicada no target (Vercel/Cloudflare/VPS). |
| `waiting_dns` | Aguardando DNS | waiting | **sim** | Aguardando o cliente apontar o domínio para a instalação. |
| `waiting_ssl` | Aguardando SSL | waiting | **sim** | Domínio apontado, aguardando emissão/propagação de certificado. |
| `waiting_customer` | Aguardando cliente | waiting | **sim** | Bloqueada por ação pendente do próprio cliente (dado, aprovação, pagamento). |
| `active` | Ativa | operational | não | Em produção, operando normalmente. |
| `maintenance` | Em manutenção | operational | não | Intervenção planejada em andamento — indisponibilidade esperada. |
| `paused` | Pausada | operational | não | Temporariamente suspensa (ex.: inadimplência), sem ser cancelamento. |
| `archived` | Arquivada | terminal | não | Encerrada — não recebe mais atualização nem monitoramento. |
| `error` | Com erro | terminal | **sim** | Falha detectada que exige intervenção manual da equipe Brighter. |

Agrupamentos derivados (`status.ts`):
- `WAITING_INSTALLATION_STATUSES` = `["waiting_dns", "waiting_ssl", "waiting_customer"]`
- `TERMINAL_INSTALLATION_STATUSES` = `["archived", "error"]`

## `CommercialStatus` (7 valores)

| id | Label | Rank |
|---|---|---|
| `lead` | Lead | 1 |
| `proposal` | Proposta enviada | 2 |
| `contract` | Contrato assinado | 3 |
| `payment_pending` | Pagamento pendente | 4 |
| `implementation` | Em implantação | 5 |
| `production` | Em produção | 6 |
| `cancelled` | Cancelado | 0 |

`COMMERCIAL_STATUS_RANK` (`status.ts`) é a fonte de verdade desses ranks —
`catalog.ts` só espelha o mesmo número para exibição, nunca redefine.

## `TechnicalStatus` (7 valores)

| id | Label | Rank |
|---|---|---|
| `draft` | Rascunho | 0 |
| `validated` | Validada | 1 |
| `ready` | Pronta | 2 |
| `deploying` | Implantando | 3 |
| `running` | Rodando | 4 |
| `warning` | Com aviso | -1 (fora da escada) |
| `failed` | Falhou | -1 (fora da escada) |

## Funções do catálogo (`catalog.ts`)

- `getInstallationStatusDefinition(id)` / `getCommercialStatusDefinition(id)`
  / `getTechnicalStatusDefinition(id)` — lançam se o id não existir no
  catálogo (nunca devolvem `undefined` silenciosamente).
- `validateStatusCatalogsCoverage()` — confere que todo status do
  vocabulário (`status.ts`) tem exatamente 1 definição no catálogo; usado
  em teste de sanidade (`tests/unit/control-plane-catalog.test.ts`).

## Onde os labels aparecem

Tela `/app/settings/control-plane` (badges por linha da tabela de
instalações) e `scripts/control-plane-summary.ts` (resumo Markdown/JSON).
Nenhum dos dois inventa rótulo próprio — ambos leem de
`lib/control-plane/catalog.ts`.
