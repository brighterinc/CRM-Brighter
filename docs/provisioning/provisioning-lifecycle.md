---
type: architecture
status: v1 — fundação
last_updated: 2026-08-02
---

# Ciclo de vida de um `ProvisioningPlan`

> Estados possíveis e transições de `ProvisioningRunStatus` (o run inteiro)
> e `ProvisioningStepStatus` (cada etapa). Ver
> [`provisioning-engine.md`](provisioning-engine.md) pra arquitetura
> completa.

## Status do run (`ProvisioningRunStatus`)

```
draft → ready → running → completed
          ↓        ↓
       blocked   failed
```

| Status | Quando acontece |
|---|---|
| `draft` | Reservado pra uso futuro (plano ainda não gerado por `generateProvisioningPlan`) — não é produzido nesta Foundation v1. |
| `ready` | `generateProvisioningPlan` não achou blocker (catálogo válido, sem ciclo, tenant×manifesto compatíveis, tenant pronto, manifesto válido). Pode ser executado. |
| `blocked` | Qualquer blocker: bug de catálogo, ciclo de dependência, incompatibilidade tenant×manifesto, blocker de prontidão do tenant (`evaluateTenantReadiness`), ou manifesto inválido. **Nenhuma etapa é executada enquanto o run está `blocked`** — `executeProvisioningPlan`/`simulateProvisioning` devolvem o plano intocado. |
| `running` | Execução em andamento (`executeProvisioningPlan` percorrendo as etapas). |
| `completed` | Todas as etapas `required` terminaram `"completed"`. |
| `failed` | Uma etapa `required` falhou — o run para (etapas seguintes não são tocadas). |
| `rolling_back` / `rolled_back` | Reservados pra uso futuro — o rollback desta Foundation v1 é só teórico (`buildRollbackPlan`), nunca executado; ver [`rollback-strategy.md`](rollback-strategy.md). |

## Status de cada etapa (`ProvisioningStepStatus`)

```
pending → ready → running → completed
             ↓        ↓
          blocked   failed
```

| Status | Quando acontece |
|---|---|
| `pending` | Etapa tem dependência(s) dentro do plano ainda não `"completed"`. |
| `ready` | Etapa não tem dependência dentro do plano (ou já foram todas satisfeitas) e o run não está `blocked`. Elegível pra rodar. |
| `blocked` | O run inteiro tem blocker global — TODA etapa nasce `"blocked"`, nunca é executada. |
| `running` | `executeProvisioningPlan` está chamando `adapter.execute` pra essa etapa (estado transitório, dentro da mesma chamada síncrona). |
| `completed` | `adapter.execute` devolveu sucesso. **Nunca reexecutada** numa chamada seguinte a `executeProvisioningPlan` com o mesmo plano — idempotência. |
| `failed` | `adapter.execute` devolveu falha. Se a etapa é `required`, o run inteiro vira `"failed"` e para; se não é `required`, o run continua. |
| `skipped` | Reservado pra uso futuro (ex.: etapa cuja dependência opcional nunca ficou disponível). |
| `rolled_back` | Resultado de `adapter.rollback` — só usado pelos adaptadores fake em teste; nenhum rollback real acontece nesta Foundation v1. |

## Relação Tenant → Deployment → Provisioning

```
Tenant (lib/tenants/)
  ├─ manifest: DeploymentManifest  ← generateDeploymentManifest() (lib/deployment/)
  └─ consumido por generateProvisioningPlan({ tenant, manifest })
                                    ↓
                          ProvisioningPlan (lib/provisioning/)
                            ├─ manifestFingerprint (nunca o manifesto inteiro)
                            └─ steps: ProvisioningStepState[]
```

Um `ProvisioningPlan` sempre depende de um `Tenant` com `manifest` anexado
(via `attachDeploymentManifest`, reusado do Tenant Engine). Sem manifesto
válido anexado, `validateTenantReadinessForProvisioning` já bloqueia o plano
inteiro (critério `deployment.manifest_present`/`deployment.manifest_valid`
do Readiness Engine).

## Idempotência

- `ProvisioningStepDefinition.idempotencyKey` é estático por etapa
  (`step.<id>`) — identifica a definição, não uma execução específica.
- `ProvisioningPlan.manifestFingerprint` é determinístico por combinação de
  tenant+manifesto (nunca por timestamp) — o mesmo input sempre produz o
  mesmo plano de fingerprint idêntico.
- `executeProvisioningPlan` nunca reexecuta etapa `"completed"` — rodar a
  mesma chamada duas vezes com o mesmo plano resultante é seguro (segunda
  chamada não produz logs novos nem incrementa `attempts`).
