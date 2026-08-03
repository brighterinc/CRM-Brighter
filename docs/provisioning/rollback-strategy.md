---
type: architecture
status: v1 — fundação
last_updated: 2026-08-02
---

# Estratégia de rollback — Provisioning Engine

> `buildRollbackPlan(plan)` (`lib/provisioning/rollback.ts`) é **puramente
> teórico** nesta Foundation v1: monta uma lista ordenada do que precisaria
> ser revertido, mas nunca executa nenhuma ação. Ver
> [`provisioning-engine.md`](provisioning-engine.md) pra arquitetura
> completa e [`provisioning-lifecycle.md`](provisioning-lifecycle.md) pros
> estados possíveis.

## O que `buildRollbackPlan` faz

1. Filtra `plan.steps` pelas que estão `status === "completed"`.
2. Dentre essas, mantém só as que o catálogo declara
   `supportsRollback: true` (`getProvisioningStepDefinition(stepId)`).
3. Inverte a ordem — a última etapa concluída aparece primeiro, espelhando
   "desfazer na ordem inversa de como foi feito".
4. Anexa uma descrição textual da ação futura (dicionário
   `ROLLBACK_ACTION_LABEL` em `lib/provisioning/rollback.ts`).

Nenhum desses passos chama `adapter.rollback`, rede, banco ou processo
externo. O tipo de retorno (`RollbackAction[]`) é só
`{ stepId, name, action }` — texto pra exibir na tela/CLI, nunca uma
instrução executável.

## Por que algumas etapas nunca suportam rollback

`supportsRollback: false` no catálogo é uma decisão deliberada, não um
detalhe pendente:

- **Etapas de validação/handoff** (`validate_tenant`, `validate_manifest`,
  `validate_modules`, `resolve_branding`, `prepare_environment_template`,
  `apply_database_schema`, `configure_database_policies`,
  `run_healthcheck`, `finalize_handoff`) não fazem sentido reverter — são
  leitura/checagem ou o fechamento do processo. Reverter aplicação de
  schema, em particular, é arriscado o suficiente pra nunca ser sugerido
  automaticamente (doutrina de migrations do `CLAUDE.md`: forward-fix, nunca
  desfazer).
- **`prepare_vps`** é `supportsRollback: false` de propósito — uma VPS é um
  recurso caro e potencialmente compartilhado no nível físico (ver a seção
  Lumina em `docs/architecture/brighter-platform.md`). Nunca sugerir
  remoção automática de VPS no rollback teórico, mesmo que a etapa tenha
  "criado" a referência — decomissionar VPS é sempre decisão manual.

## Regra geral: nunca remover recurso compartilhado

Mesmo pras etapas com `supportsRollback: true`, a ação listada em
`ROLLBACK_ACTION_LABEL` é redigida como algo que só se aplica **se o
recurso foi criado exclusivamente por esta execução** (ex.:
`create_supabase_project` → "remover projeto Supabase (só se criado
exclusivamente por esta execução)"). Nenhum adaptador real desta Foundation
existe pra sequer testar essa condição — é uma restrição textual que
qualquer adaptador real futuro terá que respeitar.

## O que fica pra depois (adaptadores reais / Control Plane)

- Um `ProvisioningAdapter.rollback()` real (que de fato desconecta um
  número de WhatsApp, remove um deploy Vercel, etc.) — hoje só existe a
  assinatura na interface (`lib/provisioning/types.ts`) e as implementações
  fake (`NoopProvisioningAdapter`, `InMemoryProvisioningAdapter`).
- Execução de rollback em cadeia (chamar `rollback()` de cada etapa listada
  por `buildRollbackPlan`, na ordem que ele já calcula) — hoje o plano é só
  exibido, nunca disparado.
- Confirmação de "recurso exclusivo desta execução" antes de qualquer
  remoção real — depende de persistência real de proveniência por recurso,
  que só a futura Control Plane vai ter.

## Confirmação

Nenhuma chamada de `buildRollbackPlan`, em nenhum teste ou uso real desta
Foundation, executa uma ação de rollback de infraestrutura. A função é
síncrona, pura, e só lê o `ProvisioningPlan` já calculado.
