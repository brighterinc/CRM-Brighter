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
│  Deployment Engine             (concluído — Foundation v1)      │
│  transforma configuração comercial de cliente (plano, módulos,   │
│  branding, domínio) em manifesto técnico validado: infra         │
│  exigida, variáveis de ambiente (só nomes), blockers/warnings,   │
│  checklist. NÃO provisiona nada. lib/deployment/.                │
│  Ver docs/deployment/deployment-engine.md.                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓ consolidado por
┌─────────────────────────────────────────────────────────────────┐
│  Tenant Engine                 (atual — Foundation v1)          │
│  consolida identidade comercial, plano, módulos, branding,       │
│  status comercial/técnico, responsáveis e referências de infra/  │
│  Supabase de um cliente White Label num `Tenant` só, com motor   │
│  de prontidão (score 0–100) e export seguro. SEM persistência    │
│  real (in-memory de demo/teste) e SEM provisionar nada.          │
│  lib/tenants/. Ver docs/tenants/tenant-engine.md.                │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (futuro)
┌─────────────────────────────────────────────────────────────────┐
│  AI Engine                     (futuro — não iniciado)          │
│  camada de configuração/observabilidade dos agentes de IA por    │
│  tenant, além do que já existe em app/app/ai/*.                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (futuro)
┌─────────────────────────────────────────────────────────────────┐
│  Outreach Engine                (futuro — não iniciado)         │
│  envio em massa e cadências multi-etapa. Hoje existe só como     │
│  `automation.campaigns` (status: planned) no Module Engine.      │
│  Ver docs/modules/campaigns-and-cadences.md.                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (futuro)
┌─────────────────────────────────────────────────────────────────┐
│  Billing Engine                 (futuro — não iniciado)         │
│  cobrança real dos clientes White Label por plano/tenant.        │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (futuro)
┌─────────────────────────────────────────────────────────────────┐
│  Monitoring Engine              (futuro — não iniciado)         │
│  saúde/observabilidade por tenant através das instalações da     │
│  Brighter (hoje cada instalação só observa a si mesma).          │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (futuro)
┌─────────────────────────────────────────────────────────────────┐
│  Provisioning Engine            (futuro — não iniciado)         │
│  cria automaticamente uma nova operação (VPS dedicada ou Lite),  │
│  configura domínio, branding, módulos, Supabase e infra a partir │
│  de um `DeploymentManifest` só. É o PRIMEIRO consumidor real de  │
│  persistência de `Tenant` — e por doutrina, vai CONSUMIR a        │
│  camada de domínio do Tenant Engine (tipos, validação, readiness)│
│  já existente, nunca substituí-la. Ver ROADMAP.md.                │
└─────────────────────────────────────────────────────────────────┘
```

Cada camada consome a anterior sem duplicar a sua regra: o Deployment Engine
reusa o catálogo e o resolvedor do Module Engine em vez de redecidir "que
módulo existe em que plano"; o Module Engine reusa `lib/branding.ts` pra
variáveis de marca. Ver `CLAUDE.md` §"Anti-patterns proibidos" item 2
("duplicação sem source of truth declarado").

## Doutrina de engine (Module/Deployment/Tenant e as futuras)

Cada fundação acima nasce como **camada de domínio pura**, nunca como CRUD/
API-first: tipos, validação, função de regra de negócio (pura,
determinística), repositório em memória (interface + implementação de
demo/teste) quando aplicável, e — quando faz sentido — uma leitura somente
do estado atual da própria instalação. **Sem persistência real, sem
migration, sem Edge Function, sem rota de API nova, sem integração com
Supabase**, até que a arquitetura peça explicitamente uma camada dona de
persistência (Provisioning Engine acima é o primeiro caso disso).

**Quando a persistência real chegar, ela CONSOME a camada de domínio já
existente — nunca a substitui.** Ex.: um futuro
`SupabaseTenantRepository` implementaria a MESMA interface
`TenantRepository` já definida em `lib/tenants/repository.ts`; os tipos, a
validação e o motor de prontidão (`evaluateTenantReadiness`) continuam
exatamente como estão.

Regra de composição, válida pro Tenant Engine e pras próximas fundações:
**cada entidade nova só REFERENCIA o que as fundações anteriores já
resolvem — nunca duplica.** No `Tenant` (`lib/tenants/types.ts`): módulos
são `string[]` de IDs (nunca a definição completa do módulo, que mora só no
Module Engine); `manifest` é o objeto literal que
`generateDeploymentManifest()` produziu (nunca regerado/reimplementado);
`branding` reusa o mesmo tipo `ClientBrandingInput` do Deployment Engine
(nunca redefinido) porque é dado de ENTRADA inevitável — o White Label
Runtime não persiste marca como entidade endereçável por ID, então não há
o que referenciar além do valor em si.

## Os três planos comerciais

| Plano | Frontend | Banco/Auth | VPS | Canais | Uso típico |
|---|---|---|---|---|---|
| **Lite** | Vercel/Cloudflare (hospedado) | Supabase Auth + Postgres; Storage/Edge Functions opcionais | Não | Sem WhatsApp | Cliente só com CRM + IA, sem canal próprio |
| **Pro** | Vercel/Cloudflare (hospedado) | Idem Lite | Não (por padrão) | Sem WhatsApp | Idem Lite + automações leves, cron gerenciado, integrações gerenciadas |
| **Dedicated** | Servido pela própria VPS | Supabase (ou banco próprio) | **Sim, exclusiva** — Docker + Caddy/SSL | WhatsApp (WAHA), IA contínua | Operação completa — modelo usado hoje pela Brighter |

## Regras de instalação

- **Cada cliente = 1 `Tenant` = 1 `Deployment`.** Nunca suportar multi-tenant
  compartilhado no banco neste nível (cliente-da-Brighter) — o multi-tenant
  que o CLAUDE.md descreve ("arquitetura multi-tenant com RLS desde o dia
  1") é OUTRO nível, dentro de uma única instalação (`organizations`, ver
  `docs/tenants/tenant-lifecycle.md` §"As três coisas que NÃO são a mesma
  coisa"). Nunca confundir os dois.
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
  Deployment Engine, e o Tenant Engine) não lê, escreve, chama ou depende
  dela de forma alguma. Nenhuma peça deste sistema deve vir a acoplar nisso.

## Onde cada fundação mora no código

| Fundação | Código | Doc |
|---|---|---|
| White Label Runtime | `lib/branding.ts`, `app/public-env-script.tsx` | `docs/white-label.md` |
| Module Engine | `lib/modules/` | `docs/modules/module-engine.md` |
| Deployment Engine | `lib/deployment/`, `app/app/settings/deployment/`, `scripts/generate-deployment-manifest.ts` | `docs/deployment/deployment-engine.md` |
| Tenant Engine | `lib/tenants/`, `app/app/settings/operacao/`, `scripts/generate-tenant-summary.ts` | `docs/tenants/tenant-engine.md`, `docs/tenants/tenant-lifecycle.md` |
