# Roadmap — Brighter Platform

> Roadmap das fundações que transformam o DeskcommCRM na base técnica
> comercializada como White Label pela Brighter. Ver
> [`docs/architecture/brighter-platform.md`](docs/architecture/brighter-platform.md)
> pro mapa completo entre elas.

## Concluído

- **White Label Runtime** — branding por ambiente (nome, logo, favicon,
  suporte, remetente, razão social), sem rebuild. `lib/branding.ts`. Ver
  `docs/white-label.md`.
- **Brighter Module Engine v1** — catálogo tipado de módulos, planos Lite/
  Pro/Dedicated, dependências, requisitos de infraestrutura, proteção de
  rotas, sidebar modular. `lib/modules/`. Ver
  `docs/modules/module-engine.md`.
- **Brighter Deployment Engine Foundation v1** — transforma configuração
  comercial de cliente em manifesto técnico validado (infra exigida,
  variáveis de ambiente só-nomes, blockers/warnings, checklist). Sem
  provisionamento real. `lib/deployment/`. Ver
  `docs/deployment/deployment-engine.md`.

## Atual

- **Brighter Tenant Engine Foundation v1** — consolida identidade
  comercial, plano, módulos, branding, domínio, target, referências de
  infra/Supabase, status comercial/técnico, responsáveis e o manifesto de
  implantação de um cliente White Label num `Tenant` só. Motor de
  prontidão (score 0–100, blockers/warnings), repositório in-memory de
  demonstração, tenant de leitura da instalação atual, tela admin
  somente-leitura (`/app/settings/operacao`), export seguro (nunca
  segredo) e CLI. Sem persistência real, sem provisionamento.
  `lib/tenants/`. Ver `docs/tenants/tenant-engine.md` e
  `docs/tenants/tenant-lifecycle.md`.

## Próximos

Ordem alvo, cada uma consumindo (nunca substituindo) as camadas de domínio
das fundações anteriores — ver "Doutrina de engine" em
`docs/architecture/brighter-platform.md`:

- **AI Engine** — camada de configuração/observabilidade dos agentes de IA
  por tenant, além do que já existe em `app/app/ai/*`.
- **Outreach Engine** — envio em massa e cadências multi-etapa
  (`automation.campaigns`, hoje `status: "planned"` no Module Engine). Ver
  `docs/modules/campaigns-and-cadences.md`.
- **Billing Engine** — cobrança real dos clientes White Label por
  plano/tenant.
- **Monitoring Engine** — saúde/observabilidade por tenant através das
  instalações da Brighter (hoje cada instalação só observa a si mesma).
- **Provisioning Engine** — cria automaticamente uma nova operação (VPS
  dedicada ou Lite), configura domínio, branding, módulos, Supabase e
  infraestrutura a partir de um único `DeploymentManifest`. É o primeiro
  consumidor real de **persistência de tenants** (tabela, migration, banco
  próprio da Brighter — nunca dentro do banco de um cliente) — consumindo
  a MESMA interface `TenantRepository` já definida em
  `lib/tenants/repository.ts`, nunca reimplementando os tipos/validação/
  readiness do Tenant Engine.
- **Suporte e SLA** — canal e processo formal de suporte por tenant.
- **Configuração de módulos pelo painel** — hoje módulos são resolvidos só
  por env var (`ENABLED_MODULES`/`DISABLED_MODULES`); falta UI de
  configuração.
