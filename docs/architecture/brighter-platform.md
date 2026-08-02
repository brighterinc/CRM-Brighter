---
type: architecture
status: v1 — fundação
last_updated: 2026-08-02
---

# Brighter Platform

> Visão de conjunto das fundações que transformam o DeskcommCRM na base técnica
> comercializada como White Label pela Brighter. Cada fundação é um épico
> próprio, documentado no seu próprio doc — este arquivo é o mapa entre elas,
> não um substituto.

## As fundações

```
┌─────────────────────────────────────────────────────────────────┐
│  White Label Runtime          (concluído)                       │
│  branding por ambiente: nome, logo, favicon, suporte, remetente,│
│  razão social — sem rebuild. lib/branding.ts.                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓ consome
┌─────────────────────────────────────────────────────────────────┐
│  Module Engine                (concluído — v1)                  │
│  catálogo tipado de módulos, planos Lite/Pro/Dedicated,          │
│  dependências, requisitos de infra, proteção de rota,            │
│  sidebar modular. lib/modules/.                                  │
│  Ver docs/modules/module-engine.md.                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓ resolvido por
┌─────────────────────────────────────────────────────────────────┐
│  Deployment Engine             (atual — Foundation v1)          │
│  transforma configuração comercial de cliente (plano, módulos,   │
│  branding, domínio) em manifesto técnico validado: infra         │
│  exigida, variáveis de ambiente (só nomes), blockers/warnings,   │
│  checklist. NÃO provisiona nada. lib/deployment/.                │
│  Ver docs/deployment/deployment-engine.md.                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (futuro)
┌─────────────────────────────────────────────────────────────────┐
│  AI Engine                     (futuro — não iniciado)          │
│  camada de configuração/observabilidade dos agentes de IA por    │
│  tenant, além do que já existe em app/app/ai/*.                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (futuro)
┌─────────────────────────────────────────────────────────────────┐
│  Outreach & AI Cadence Engine  (futuro — não iniciado)          │
│  envio em massa e cadências multi-etapa. Hoje existe só como     │
│  `automation.campaigns` (status: planned) no Module Engine.      │
│  Ver docs/modules/campaigns-and-cadences.md.                     │
└─────────────────────────────────────────────────────────────────┘
```

Cada camada consome a anterior sem duplicar a sua regra: o Deployment Engine
reusa o catálogo e o resolvedor do Module Engine em vez de redecidir "que
módulo existe em que plano"; o Module Engine reusa `lib/branding.ts` pra
variáveis de marca. Ver `CLAUDE.md` §"Anti-patterns proibidos" item 2
("duplicação sem source of truth declarado").

## Os três planos comerciais

| Plano | Frontend | Banco/Auth | VPS | Canais | Uso típico |
|---|---|---|---|---|---|
| **Lite** | Vercel/Cloudflare (hospedado) | Supabase Auth + Postgres; Storage/Edge Functions opcionais | Não | Sem WhatsApp | Cliente só com CRM + IA, sem canal próprio |
| **Pro** | Vercel/Cloudflare (hospedado) | Idem Lite | Não (por padrão) | Sem WhatsApp | Idem Lite + automações leves, cron gerenciado, integrações gerenciadas |
| **Dedicated** | Servido pela própria VPS | Supabase (ou banco próprio) | **Sim, exclusiva** — Docker + Caddy/SSL | WhatsApp (WAHA), IA contínua | Operação completa — modelo usado hoje pela Brighter |

## Regras de instalação

- **Uma instalação, um banco, por cliente.** Cada cliente White Label tem seu
  próprio projeto Supabase (ou banco dedicado) — não há multi-tenant
  compartilhado entre clientes distintos da Brighter neste modelo (o
  multi-tenant do DeskcommCRM em si é dentro de uma instalação, para as
  organizações daquele cliente).
- **Lite/Pro:** frontend hospedado (Vercel ou Cloudflare) + Supabase próprio do
  cliente. Sem VPS.
- **Dedicated:** VPS exclusiva do cliente. Nunca compartilhada entre clientes,
  e nunca a mesma VPS de outra aplicação crítica não relacionada — ver seção
  abaixo.
- **Nenhuma dependência direta da Lumina.** A Lumina (`/opt/brighter-lumina`,
  porta 8000) é uma aplicação crítica de terceiros que pode coexistir na
  mesma VPS física em alguns ambientes operacionais, mas o DeskcommCRM (e o
  Deployment Engine) não lê, escreve, chama ou depende dela de forma alguma.
  Nenhuma peça deste sistema deve vir a acoplar nisso.

## Onde cada fundação mora no código

| Fundação | Código | Doc |
|---|---|---|
| White Label Runtime | `lib/branding.ts`, `app/public-env-script.tsx` | `docs/white-label.md` |
| Module Engine | `lib/modules/` | `docs/modules/module-engine.md` |
| Deployment Engine | `lib/deployment/`, `app/app/settings/deployment/`, `scripts/generate-deployment-manifest.ts` | `docs/deployment/deployment-engine.md` |
