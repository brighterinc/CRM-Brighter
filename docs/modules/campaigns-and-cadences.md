---
type: spec (futura, não implementada)
status: planned
module: automation.campaigns
last_updated: 2026-08-01
---

# Campanhas e cadências (`automation.campaigns`)

> **Nada neste documento está implementado.** É a especificação funcional do
> módulo `automation.campaigns`, catalogado em `lib/modules/catalog.ts` com
> `status: "planned"` e `defaultEnabled: false`. Existe pra registrar o desenho
> antes da construção — não crie schema, fila, worker ou scheduler a partir
> deste documento sem uma sessão de implementação dedicada.

## O que é

Envio em massa e cadências multi-etapa (sequência de mensagens com intervalo),
com IA acompanhando a resposta do lead e podendo pausar a cadência, classificar
a resposta, atualizar o pipeline e transferir para humano — tudo respeitando as
regras de anti-banimento do WhatsApp já em vigor no canal (`channel.whatsapp`,
ver `CLAUDE.md` § WAHA).

## Dependências

- **Módulo:** depende de `core.contacts` (uma campanha opera sobre uma
  segmentação de contatos existentes).
- **Infra:** `database`, `scheduler`, `worker` (ver `requires` no catálogo).
  É por isso que `automation.campaigns` está restrito a `allowedPlans: ["dedicated"]`
  nesta primeira versão — pacing, jitter e pausa-ao-responder exigem um worker
  rodando continuamente, que só existe no modelo Dedicated.

## Conceitos

### Segmentação e listas
- Segmentação dinâmica (filtro salvo sobre `crm_leads`/`contacts`: tag, estágio
  de pipeline, campo customizado, última interação) ou lista estática
  (snapshot de contatos em um momento).
- Toda segmentação/lista é `organization_id`-scoped (RLS), como qualquer
  tabela tenant-aware da doutrina.

### Templates e variáveis
- Corpo de mensagem com variáveis (`{{primeiro_nome}}`, `{{ultimo_produto}}`,
  etc.) resolvidas por contato no momento do envio.
- **Spinning de copy** (múltiplas variações de um mesmo texto, sorteadas por
  envio) — já é doutrina de anti-banimento (`CLAUDE.md` § WAHA) e se aplica
  aqui.
- Templates oficiais da Meta (Cloud API) seguem o fluxo de aprovação já
  existente (`app/app/settings/templates`) quando o canal for oficial;
  campanhas via WAHA usam texto livre.

### Etapas múltiplas (cadência)
- Uma campanha pode ter N etapas sequenciais (ex.: dia 0 → mensagem 1; dia 3 →
  mensagem 2 se não respondeu; dia 7 → mensagem 3).
- Cada etapa declara um **intervalo** mínimo em relação à etapa anterior (ou à
  entrada na campanha).

### Janela de envio, limites e jitter
- Reaproveita as regras de anti-banimento já em vigor: janela 7h–22h, evitar
  domingo, throttle de campanha 1 msg/5s (mais conservador que o 1 msg/1.2s de
  conversas 1:1), jitter ≤800ms, warm-up 7–14d para números novos.
- Limite diário/por-número configurável por organização, pra não estourar a
  capacidade de um número recém-aquecido.

### Pausa automática na resposta
- Assim que o lead responde (inbound real, não uma leitura/entrega), a
  cadência daquele contato pausa automaticamente — não envia a próxima etapa
  agendada. Requisito de produto e também de conformidade: continuar
  disparando pra quem já respondeu é o tipo de comportamento que gera bloqueio
  em massa pela Meta/WhatsApp.

### Opt-out
- Reaproveita a doutrina STOP detection já existente (`CLAUDE.md` § WAHA):
  regex `/STOP|PARAR|SAIR|UNSUBSCRIBE/i` no inbound → `is_blocked=true` →
  contato nunca mais entra em campanha nenhuma, de nenhuma organização (é
  campo do contato, não da campanha).

### Retries e idempotência
- Falha de envio (timeout WAHA, rate limit) tem retry com backoff, respeitando
  o mesmo teto de tentativas usado no envio 1:1 hoje.
- Idempotência por `(organization_id, campaign_id, contact_id, step_index)` —
  reprocessar um evento de disparo não duplica envio, mesmo princípio de
  `unique (organization_id, external_id)` já em uso pra mensagens WhatsApp.

### Métricas
- Por campanha: enviados, entregues, lidos, respondidos, opt-out, taxa de
  conversão (mudança de estágio de pipeline atribuível à campanha).
- Alimenta `analytics.metrics` (módulo já existente) em vez de criar um
  segundo painel de métricas paralelo.

### Associação com agente de IA
- Uma campanha pode declarar um `ai_agent_id` responsável por conduzir a
  conversa depois que o lead responde — reaproveita `ai.agents` (não é um
  motor de IA separado).
- O agente:
  - **Classifica a resposta** (interessado / não interessado / dúvida / fora
    de contexto) usando o mesmo pipeline de classificação de intenção do
    atendimento normal.
  - **Atualiza o pipeline** (move o card de estágio conforme a classificação —
    ex.: resposta positiva move pra "Qualificado").
  - **Transfere para humano** quando a conversa sai do roteiro esperado da
    campanha (mesmo mecanismo de handoff já usado no atendimento 1:1).

## Diferenças Lite / Pro / Dedicated

| | Lite | Pro | Dedicated |
|---|---|---|---|
| Disponível nesta v1 do catálogo | Não (`allowedPlans` não inclui) | Não (`allowedPlans` não inclui) | Sim, mas `planned` — ainda não implementado |
| Por quê | Sem worker/scheduler contínuo | Automação "leve" (Edge Functions) não cobre pacing/jitter/pausa-ao-responder com a confiabilidade exigida | Tem worker + scheduler dedicados |
| Caminho futuro | Em aberto — uma versão "manual" (sem agendamento contínuo, disparo sob demanda via Edge Function) é candidata, mas não decidida | Mesma observação do Lite | É onde a implementação completa (fila + worker + scheduler) nasce primeiro |

Esta tabela documenta o estado de decisão atual, não uma promessa de roadmap —
Lite/Pro podem ganhar uma versão reduzida do módulo depois, mas isso exige
desenho próprio (provavelmente baseado em Edge Function + cron gerenciado pelo
Supabase, sem worker de longa duração).

## Não escopo desta etapa (Module Engine v1)

Nada disto é construído agora: schema (`crm_campaigns`, `crm_campaign_steps`,
`crm_campaign_enrollments` ou equivalente), fila/evento em `event_log`, worker
de disparo, scheduler, UI de criação de campanha. O catálogo só registra a
existência do módulo como `planned` pra que a fundação (resolução de plano,
proteção de rota, sidebar, tela de módulos) já saiba lidar com um módulo nesse
estado quando a implementação de verdade chegar.
