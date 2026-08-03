---
type: architecture
status: v1 — fundação
last_updated: 2026-08-03
---

# Brighter Control Plane

> Fundação que consolida TODAS as instalações White Label da Brighter num
> único agregado (`Installation`) e sabe o estado atual de cada uma —
> pense "Supabase Dashboard"/"Vercel Dashboard"/"Cloudflare Dashboard".
> "Control Plane" é nome interno de código; a tela voltada ao usuário final
> chama isso de "Control Plane" também (`/app/settings/control-plane`), sem
> tradução — é vocabulário já consolidado de infraestrutura.

## Objetivo

Antes desta fundação, cada peça já sabia responder uma pergunta isolada:
o Tenant Engine sabe **quem** é o cliente e se está pronto; o Deployment
Engine sabe **o quê** uma instalação precisa; o Provisioning Engine sabe
**em que ordem** executar. Faltava a camada que olha para TODAS as
instalações ao mesmo tempo e responde "qual o estado de cada uma". A
Control Plane resolve isso, permanecendo — como toda fundação anterior —
uma camada de domínio pura nesta Foundation v1: sem infraestrutura real,
sem chamada externa, sem persistência real, sem API, sem migration.

## Princípios (mesma doutrina das fundações anteriores)

- **Camada de domínio, não CRUD.** Tipos, catálogo de metadados de status,
  validação, repositório in-memory, filtros, resumo — nunca uma API REST
  nova, nunca uma tabela, nunca uma Edge Function, nunca Docker, nunca VPS,
  nunca DNS, nunca projeto Supabase real. Isso vale até uma fase futura
  decidir dar à Control Plane persistência e execução real (ver
  `ROADMAP.md`).
- **Agrega, nunca duplica, as cinco fundações anteriores.** `Installation`
  é composta de um `Tenant` (`lib/tenants/`) + o `DeploymentManifest` já
  anexado a ele (`lib/deployment/`) + o `ProvisioningSummary` derivado dele
  (`lib/provisioning/`) + `branding`/`modules` — todos DERIVADOS do mesmo
  `tenant`, nunca aceitos como input solto em `createInstallation`/
  `updateInstallation`. `validateInstallationInput` (`validation.ts`) FALHA
  se `deployment`/`branding`/`modules` divergirem do `tenant` embutido —
  não há uma segunda fonte de verdade possível.
- **Vocabulário de status é intencionalmente PRÓPRIO, não duplicado.** O
  `Tenant` já rastreia seu `commercialStatus`/`technicalStatus` — o que ELE
  vive. A Control Plane define `InstallationStatus`/`CommercialStatus`/
  `TechnicalStatus` — como a BRIGHTER está operando aquela instalação
  (ex.: `waiting_dns`/`waiting_ssl` são passos operacionais do time, nunca
  algo que o cliente relata sobre si mesmo). São dois eixos do mesmo
  domínio, com vocabulário deliberadamente distinto — ver `types.ts` pro
  raciocínio completo.
- **Sem persistência real.** Só existe `InMemoryInstallationRepository` —
  mesma doutrina do `InMemoryTenantRepository` do Tenant Engine. Cada
  instância começa vazia; nunca singleton global mutável.
- **Sem infraestrutura real.** Nenhum arquivo de `lib/control-plane/*`
  cria Docker, VPS, projeto Supabase, registro DNS ou acessa a Lumina.

## Arquitetura

```
lib/control-plane/
  types.ts        — InstallationStatus/CommercialStatus/TechnicalStatus, Installation, erros
  status.ts        — vocabulário fechado + type guards + ranks/agrupamentos
  catalog.ts       — metadados de status (label/descrição/categoria) — camada de apresentação sobre status.ts
  validation.ts    — validateInstallationInput() — reusa validateTenantInput/validateSlug/etc
  repository.ts    — InstallationRepository + InMemoryInstallationRepository + createDemoInstallations()
  filters.ts       — InstallationFilter + applyInstallationFilters()/matchesInstallationFilter()
  summary.ts       — ControlPlaneSummary + generateControlPlaneSummary()/renderControlPlaneSummaryMarkdown()
  index.ts         — barrel público (export *)

app/app/settings/control-plane/page.tsx   — tela admin-only, somente leitura
scripts/control-plane-summary.ts           — CLI (pnpm control:summary)
```

Assim como `lib/provisioning/`, **nenhum arquivo de `lib/control-plane/*`
lê `process.env`** — mas cuidado ao importar `Tenant`: os submódulos
importam `@/lib/tenants/validation` e `@/lib/tenants/repository`
diretamente, nunca o barrel `@/lib/tenants` (que reexporta
`current-installation.ts`, que lê `process.env` via `lib/env.ts` e lança
se as env vars do Supabase não estiverem configuradas — o mesmo cuidado
que `lib/provisioning/` já documentava).

## `Installation` — o agregado central

```ts
type Installation = {
  id: string;
  slug: string;
  company: string;
  status: InstallationStatus;       // visão da Brighter — ciclo de vida operacional
  createdAt: string;
  updatedAt: string;
  deploymentPlan: DeploymentPlan;    // = tenant.plan
  tenant: Tenant;                    // lib/tenants/ — identidade, contatos, refs de infra
  branding: ClientBrandingInput;     // = tenant.branding (nunca copiado a valor divergente)
  modules: string[];                 // = tenant.enabledModules (nunca a definição completa)
  deployment: DeploymentManifest;    // = tenant.manifest
  provisioning: ProvisioningSummary; // derivado de generateProvisioningPlan+generateProvisioningSummary
  commercial: CommercialStatus;      // visão da Brighter — estágio comercial
  technical: TechnicalStatus;        // visão da Brighter — estágio técnico
};
```

`deployment`/`branding`/`modules`/`provisioning`/`deploymentPlan` nunca são
passados como input em `InstallationCreateInput` — só `slug`/`company`/
`status`/`commercial`/`technical`/`tenant` (com `tenant.manifest` já
anexado). O repositório deriva o resto (`deriveInstallationFromTenant`),
garantindo por construção que nunca existe uma cópia divergente do que o
tenant já sabe.

## Catálogo de status (`catalog.ts`)

`INSTALLATION_STATUS_CATALOG`/`COMMERCIAL_STATUS_CATALOG`/
`TECHNICAL_STATUS_CATALOG` dão label em pt-BR, descrição operacional e
categoria (`planning`/`provisioning`/`waiting`/`operational`/`terminal`
pros status de instalação) — usados pela tela admin (badges) e pelo CLI.
`validateStatusCatalogsCoverage()` confere que todo status do vocabulário
(`status.ts`) tem exatamente 1 definição no catálogo — sanidade, mesmo
padrão de `validateStepCatalog` no Provisioning Engine.

## Repositório (`repository.ts`)

`InMemoryInstallationRepository` — DEMONSTRAÇÃO/TESTE, não produção:

- `createInstallation(input)` / `updateInstallation(id, patch)` — derivam
  `deploymentPlan`/`branding`/`modules`/`deployment`/`provisioning` do
  `tenant`, nunca aceitam esses campos soltos; validam com
  `validateInstallationInput` antes de guardar.
- `archiveInstallation(id)` — atalho pra `updateInstallation(id, { status: "archived" })`.
- `listInstallations()` / `findInstallation(idOrSlug)` — por id OU slug.
- `filterInstallations(predicate)` — recebe um predicado arbitrário; os
  filtros estruturados (plano/status/domínio/empresa/módulo/marca/data)
  vivem em `filters.ts` (`applyInstallationFilters`) e podem ser compostos
  com ele.
- `countByStatus()` — contagem agregada por `InstallationStatus`.

`createDemoInstallations()` monta 1 instalação por plano (Lite/Pro/
Dedicated) a partir de `createDemoTenants()` (Tenant Engine), gerando e
anexando o manifesto de cada uma — usado por testes, CLI e a tela admin.
Nunca dado real, nunca persistido.

## Filtros (`filters.ts`)

`InstallationFilter` — `plan`/`status`/`commercial`/`technical`/`domain`/
`company`/`module`/`brand`/`createdAfter`/`createdBefore`. Todos os
critérios combinam com **AND**, nunca OR. `domain`/`company`/`brand` fazem
substring case-insensitive; os demais são igualdade exata.

## Resumo (`summary.ts`)

`generateControlPlaneSummary(installations)` — total, contagem por status/
comercial/técnico/plano, ativas, em implantação (`provisioning`+
`deploying`), com erro (`status === "error"` OU `technical === "failed"`),
aguardando DNS/SSL/cliente, e módulos habilitados **distintos** (nunca soma
bruta — uma instalação com 5 módulos e outra com os mesmos 5 conta como 5,
não 10). `renderControlPlaneSummaryMarkdown(summary)` gera a versão
Markdown, mesmo estilo das CLIs anteriores. `selectWaitingInstallations`
filtra só as instalações nos três status de espera.

## Tela `/app/settings/control-plane`

Server Component admin-only, mesmo guard de `/app/settings/provisionamento`
(`requireAuth()` + `resolveActiveOrg()` + `ROLE_RANK[...] >= ROLE_RANK.admin`
OU `is_platform_admin`, senão `redirect("/403")`). Somente leitura — sem
formulário, sem mutação, sem botão de criar/editar/arquivar instalação.
Mostra: cards de estatística (total, ativas, em implantação, com erro,
aguardando DNS/SSL, módulos habilitados), contagem por plano, e a lista de
instalações de demonstração com badges de status/comercial/técnico.

## CLI (`pnpm control:summary`)

```bash
pnpm control:summary                 # Markdown
pnpm control:summary -- --format json
```

Monta o catálogo de demonstração (`createDemoInstallations()`) e imprime o
resumo agregado. Não lê `.env`, não persiste, não provisiona.

## Relação com as fundações anteriores

```
White Label Runtime → Module Engine → Deployment Engine → Tenant Engine → Provisioning Engine
                                                                                    ↓ agregado por
                                                                          Control Plane
```

Nunca duplica: reusa a identidade/prontidão do Tenant Engine, o manifesto
do Deployment Engine e o resumo do Provisioning Engine. Ver mapa completo
em [`docs/architecture/brighter-platform.md`](../architecture/brighter-platform.md).

## Limitações da Foundation v1

- **Não persiste nada de verdade** — `InMemoryInstallationRepository` vive
  só na memória do processo; toda instância começa vazia.
- **Não conhece instalações reais** — a tela e o CLI mostram só o catálogo
  de demonstração (`createDemoInstallations()`); não há hoje um jeito de
  registrar a instalação real de um cliente na Control Plane (isso é
  trabalho de uma fase futura com persistência real).
- **Não provisiona, não faz deploy, não executa nada** — só agrega e
  resume o que as fundações anteriores já calculam.

## Confirmação: esta versão não provisiona nada

Nenhum arquivo de `lib/control-plane/*` cria VPS, projeto Supabase,
interage com Vercel/Cloudflare, configura DNS/Caddy ou sobe container
Docker. A tela e a CLI são puramente leitura. Nenhuma peça deste engine
acessa `/opt/brighter-lumina` ou a porta 8000.
