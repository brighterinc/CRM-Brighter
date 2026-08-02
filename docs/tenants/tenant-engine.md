---
type: architecture
status: v1 — fundação
last_updated: 2026-08-02
---

# Tenant Engine

> Fundação que consolida um cliente White Label — identidade comercial,
> plano, módulos, branding, domínio, target, referências de infra/Supabase,
> status comercial/técnico, responsáveis, datas e o manifesto de implantação
> — como uma entidade só (`Tenant`). "Tenant Engine" é nome interno; a tela
> voltada ao usuário final chama isso de "Operação" (`/app/settings/operacao`),
> nunca a marca de quem opera a instalação.

**⚠️ Antes de ler: "Tenant" aqui NÃO é a mesma coisa que "tenant" em
`/admin/tenants`.** O DeskcommCRM já tem uma feature de plataforma real
(`app/admin/(protected)/tenants/`, `app/api/v1/admin/tenants/`,
`hooks/useAdminTenants.ts` → `AdminTenantRow`) que chama de "tenant" cada
linha da tabela `organizations` — o cliente multi-tenant DENTRO de uma
instalação (o que este mesmo doc, em outro contexto, chamaria de
"organização"). O `Tenant` deste engine é outra coisa, um nível acima: **uma
instalação White Label inteira** (1 cliente → 1 Supabase próprio → 1 domínio
→ 1 deploy). Não há colisão de rota (`/admin/tenants` vs.
`/app/settings/operacao`) nem de tipo TypeScript (`AdminTenantRow` vs.
`Tenant` de `lib/tenants/types.ts`), mas é a mesma palavra em dois níveis de
abstração — ver a distinção completa em
[`tenant-lifecycle.md`](tenant-lifecycle.md).

## Objetivo

Antes desta fundação, um cliente White Label vivia espalhado: plano e
módulos no Module Engine, manifesto técnico no Deployment Engine, marca no
White Label Runtime — nada os amarrava numa entidade só, com status
comercial/técnico, responsáveis e prontidão. O Tenant Engine resolve isso
consolidando tudo num tipo `Tenant`, com um motor de prontidão
(`evaluateTenantReadiness`) que diz exatamente o que falta antes de
provisionar de verdade — sem provisionar nada nesta Foundation v1.

## Princípios (não-negociáveis desta e das próximas fundações)

- **Camada de domínio, não CRUD.** Tipos, validação, função de regra de
  negócio pura, repositório em memória, leitura da instalação atual, export
  seguro — nunca uma API REST nova, nunca uma tabela, nunca uma Edge
  Function, nunca integração com Supabase real. Isso vale pra esta
  Foundation v1 até a arquitetura pedir explicitamente uma camada dona de
  persistência (o futuro Provisioning Engine — ver
  `docs/architecture/brighter-platform.md`).
- **Toda futura persistência CONSOME esta camada, nunca a substitui.** Um
  futuro `SupabaseTenantRepository` implementaria a mesma interface
  `TenantRepository` já definida aqui; tipos, validação e
  `evaluateTenantReadiness` continuam exatamente como estão.
- **Cada cliente = 1 `Tenant` = 1 `Deployment`.** Nunca multi-tenant
  compartilhado no banco neste nível — ver a distinção com `organizations`/
  `/admin/tenants` em [`tenant-lifecycle.md`](tenant-lifecycle.md).
- **`Tenant` só REFERENCIA — nunca duplica** o que Branding Runtime, Module
  Engine e Deployment Engine já resolvem: módulos são `string[]` de IDs
  (nunca a definição completa do módulo), `manifest` é o objeto literal
  produzido por `generateDeploymentManifest()` (nunca reimplementado),
  `branding` reusa `ClientBrandingInput` (nunca redefinido) porque é dado
  de entrada inevitável — o White Label Runtime não persiste marca como
  entidade endereçável por ID.

## Arquitetura

```
lib/tenants/
  types.ts                — Tenant, status comercial/técnico, contatos, referências, TenantReadiness
  status.ts                — listas de status válidos + COMMERCIAL_STATUS_RANK
  validation.ts            — validateTenantInput() + attachDeploymentManifest()
  readiness.ts             — evaluateTenantReadiness() — função pura, score 0–100
  summary.ts               — summarizeTenantTechnical()/summarizeTenantCommercial()
  export.ts                — exportTenantSafe() + sanitizeDeep() — nunca segredo
  current-installation.ts  — getCurrentInstallationTenant() — único arquivo que lê env
  repository.ts            — TenantRepository + InMemoryTenantRepository (demo/teste)
  index.ts                 — barrel público (export *)

app/app/settings/operacao/page.tsx        — tela admin-only, somente leitura
scripts/generate-tenant-summary.ts        — CLI (pnpm tenant:summary)
```

Só `current-installation.ts` lê `process.env` (via `@/lib/env`,
`@/lib/branding`, `@/lib/modules/runtime`) — todo o resto é puro, sem I/O.
**A CLI importa dos submódulos diretamente (`../lib/tenants/validation`,
`../lib/tenants/readiness`, `../lib/tenants/types`), nunca do barrel
`../lib/tenants`** — o barrel reexporta `current-installation.ts`, que
puxaria a validação de env vars da instalação real pra dentro da CLI, que
deve funcionar sem nenhum `.env` configurado (mesma independência de
`generate-deployment-manifest.ts`).

## O tipo `Tenant`

```ts
type Tenant = {
  id: string;                              // UUID v4
  clientName: string;
  clientSlug: string;
  legalName?: string;
  domain: string;
  plan: DeploymentPlan;                    // reusado de lib/deployment
  requestedModules: string[];
  enabledModules: string[];
  branding: ClientBrandingInput;           // reusado de lib/deployment
  commercialStatus: TenantCommercialStatus;
  technicalStatus: TenantTechnicalStatus;
  primaryContact?: TenantContact;
  accountManager?: TenantContact;
  infrastructure?: TenantInfrastructureReference; // nunca credencial
  supabase?: TenantSupabaseReference;             // nunca chave/connection string
  manifest?: DeploymentManifest;           // reusado de lib/deployment
  notes?: string;
  createdAt: string;                       // ISO-8601 UTC
  updatedAt: string;                       // ISO-8601 UTC
};
```

Reusa (nunca redefine) `DeploymentPlan`, `DeploymentTarget`,
`ClientBrandingInput` e `DeploymentManifest` do Deployment Engine — um
tenant SEMPRE tem seu manifesto gerado por `generateDeploymentManifest()`,
nunca um manifesto reimplementado aqui.

**Nenhum campo de segredo existe no tipo** — nada de `serviceRoleKey`,
`databaseUrl`, `connectionString`, `password`, `token`, `apiKey`, chave SSH.
`TenantInfrastructureReference`/`TenantSupabaseReference` só guardam nome de
recurso, ID externo e URL pública.

## Status comercial e técnico

```ts
type TenantCommercialStatus = "lead" | "proposal" | "contracted" | "onboarding" | "active" | "suspended" | "cancelled";
type TenantTechnicalStatus  = "draft" | "configuration_pending" | "ready_to_provision" | "provisioning" | "validation" | "live" | "degraded" | "archived";
```

`COMMERCIAL_STATUS_RANK` (`lib/tenants/status.ts`) ordena o ciclo comercial
— só existe pro critério de readiness "contrato confirmado" (`rank ≥
contracted`). Ver o ciclo completo em
[`tenant-lifecycle.md`](tenant-lifecycle.md).

## Validação

`validateTenantInput(input)` devolve `TenantValidationError[]`
(`{ field, message }`) — nunca lança, nunca mensagem genérica solta. Reusa
`validateClientName`, `validateSlug`, `validateDomain`, `validatePlan`,
`validateBranding`, `isKnownModuleId` de `lib/deployment/validation.ts` (não
reimplementa) e adiciona: `id` (UUID v4), status comercial/técnico contra
`status.ts`, e-mails de `primaryContact`/`accountManager`, datas ISO-8601,
módulos pedidos/habilitados desconhecidos no catálogo.

`attachDeploymentManifest(tenant, manifest)` confere que o manifesto foi
gerado PRA ESTE tenant — `clientSlug`, `domain`, `plan`, `clientName`,
`requestedModules` (como conjunto) e `branding.appName` (via
`manifest.environment.generatedPublicValues.APP_NAME`). Divergência em
qualquer campo devolve `{ ok: false, errors: TenantValidationError[] }`;
sucesso devolve `{ ok: true, tenant }` com `manifest` e `enabledModules`
atualizados.

## Readiness Engine

`evaluateTenantReadiness(tenant)` — função pura, sem I/O. Score
determinístico: cada item **blocker** tem peso fixo somando 100; o score é a
soma dos pesos dos blockers satisfeitos. Itens **warning** nunca entram no
peso — nunca "esconde blocker atrás do score". `ready` é sempre
`blockers.length === 0`, nunca derivado do score.

| Categoria | Peso | Itens (blocker, exceto onde dito) |
|---|---|---|
| Comercial | 15 | cliente identificado (5) · contrato confirmado — `commercialStatus` rank ≥ `contracted` (5) · responsável definido — `accountManager` presente (5) |
| Branding | 15 | nome (5) · domínio válido (5) · e-mail de suporte válido (5) — **logo é warning** (`branding.logo`, peso 0) |
| Infraestrutura | 20 | target compatível com o plano via `DEPLOYMENT_PROFILES` (8) · referência de infra presente (12) — Dedicated exige `target==='vps' && provider && externalId`; Lite/Pro exige `projectReference` |
| Supabase | 15 | `projectRef` presente (8) · `projectUrl` válido (7) — nunca exige segredo, o tipo não tem onde guardar um |
| Módulos | 15 | todos os `requestedModules` existem no catálogo (5) · nenhum módulo habilitado com `status:"planned"` (5) · `dependsOn` de todo módulo habilitado também habilitado (5) |
| Deployment | 20 | manifesto anexado (10) · manifesto válido — `manifest.valid===true` (10) |

Além dos itens acima, dois **warnings de consistência** (nunca blocker,
nunca afetam score): `technicalStatus==='ready_to_provision'` com blockers
pendentes; `technicalStatus==='live'` sem referência de infra válida ou sem
manifesto válido.

## Resumos (`summary.ts`)

`summarizeTenantTechnical(tenant, readiness)` e
`summarizeTenantCommercial(tenant, readiness)` combinam `Tenant` +
`TenantReadiness` (já calculada, nunca recalculada) em objetos prontos pra
tela/CLI — sem I/O, sem segredo.

## Export seguro (`export.ts`)

`exportTenantSafe(tenant)` monta um JSON com identificação, plano, módulos,
branding, status, readiness recalculada, referências públicas de
infra/Supabase e nomes de variáveis de ambiente ainda pendentes (nunca
valor) — **deliberadamente sem `primaryContact`/`accountManager`**, fora do
escopo deste export. O payload final passa por `sanitizeDeep()`: remove
recursivamente, em qualquer profundidade (objeto ou array aninhado), toda
chave que bata `password|token|api[_-]?key|secret|service[_-]?role|
database[_-]?url|connection[_-]?string|ssh[_-]?key|private[_-]?key`
(case-insensitive) — defesa em profundidade mesmo que o objeto de entrada em
runtime seja "sujo" (propriedade extra fora do tipo `Tenant`, algo que o
TypeScript não pega em runtime). Testado em
`tests/unit/tenant-export.test.ts` com objetos deliberadamente sujos, não só
com `Tenant` bem tipado.

## Tenant da instalação atual

`getCurrentInstallationTenant()` (`lib/tenants/current-installation.ts`)
monta um `Tenant` de leitura da PRÓPRIA instalação, a partir de
`branding()`, `getDeploymentPlan()`/`getEnabledModules()`,
`generateDeploymentManifest()` e `env.NEXT_PUBLIC_APP_URL`/
`env.NEXT_PUBLIC_SUPABASE_URL` (já públicos hoje — nunca a anon key, que nem
existe no tipo `TenantSupabaseReference`). `commercialStatus`/
`technicalStatus` ficam fixos em `"active"`/`"live"` (é a própria instalação
rodando). **Nunca persistido** — id sintético `"current-installation"`, só
para a tela `/app/settings/operacao`. Referências de infra/Supabase ficam
PARCIAIS de propósito: esta Foundation não rastreia `provider`/`externalId`/
`projectReference` de nenhuma instalação real (isso é a futura Control
Plane) — a readiness resultante mostra esse gap honestamente como
pendência, nunca inventa dado.

## Repositório in-memory

```ts
interface TenantRepository {
  list(): Promise<Tenant[]>;
  findById(id: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  create(input: TenantCreateInput): Promise<Tenant>;
  update(id: string, patch: Partial<Tenant>): Promise<Tenant>;
}
```

`InMemoryTenantRepository` é a única implementação desta Foundation v1 — **é
DEMONSTRAÇÃO/TESTE, nunca singleton global da aplicação.** Cada instância
começa vazia e some ao fim do processo; sem tabela, sem migration, sem
Supabase real. `create()`/`update()` chamam `validateTenantInput` e lançam
`TenantValidationFailedError` (com `.errors` estruturado) em caso de
inválido; `update()` de id inexistente lança `TenantNotFoundError`.
`createDemoTenants()` devolve um catálogo de demonstração com 1 tenant por
plano (Lite/Pro/Dedicated), usado por testes e pela CLI.

Persistência real de tenant (tabela, migration, Supabase) é trabalho da
futura **Control Plane** — um serviço separado do próprio CRM instalado (ver
`docs/tenants/tenant-lifecycle.md` e `ROADMAP.md`), não desta Foundation.

## Tela `/app/settings/operacao`

Server Component admin-only, mesmo guard de
`/app/settings/deployment` (`requireAuth()` + `resolveActiveOrg()` +
`ROLE_RANK[...] >= ROLE_RANK.admin`, senão `redirect("/403")`). Somente
leitura — sem formulário, sem mutação. Mostra cliente/slug/domínio/plano,
status comercial/técnico, score de prontidão com blockers/warnings/
completed, branding, módulos habilitados/rejeitados, target e
infraestrutura, referência pública do Supabase, datas, observações, o JSON
do export seguro (prova visual de "nunca segredo"), e links para
`/app/settings/deployment` e `/app/settings/modules`. Linguagem neutra pro
White Label: "Instalação", "Operação", "Prontidão", "Infraestrutura",
"Configuração pendente" — a string "Tenant Engine" nunca aparece em texto
visível.

## Uso da CLI

`scripts/generate-tenant-summary.ts`, exposta como `pnpm tenant:summary`:

```bash
pnpm tenant:summary -- \
  --client "Empresa Exemplo" \
  --slug empresa-exemplo \
  --domain crm.empresa.com.br \
  --plan lite \
  --modules core.contacts,core.pipeline
```

Opcionais de branding: `--app-name --legal-name --logo-url --favicon-url
--support-email --website-url --from-name --from-email`. Opcionais de
tenant: `--target vercel|cloudflare|vps --commercial-status
--technical-status --contact-name --contact-email --contact-phone
--contact-role --am-name --am-email --am-phone --am-role --provider
--project-reference --external-id --region --supabase-project-ref
--supabase-project-url --supabase-region --notes --format json|markdown`
(default `json`).

Monta um tenant **temporário em memória** (nunca usa
`InMemoryTenantRepository`, nunca persiste), gera o manifesto
(`generateDeploymentManifest`), anexa (`attachDeploymentManifest`), calcula
a prontidão (`evaluateTenantReadiness`) e imprime. Não lê `.env`, não altera
`.env`, não lê nem grava segredo. Sai com código `!= 0` quando há blockers
de prontidão ou o manifesto não pôde ser anexado.

## Relação com as fundações anteriores

```
White Label Runtime (lib/branding.ts)
        ↓ consumido por
Module Engine (lib/modules/)
        ↓ resolvido por
Deployment Engine (lib/deployment/) — manifesto técnico
        ↓ consolidado por
Tenant Engine (lib/tenants/) — identidade, status, prontidão
```

Nunca duplica: reusa o catálogo/resolvedor do Module Engine (via o
manifesto), o gerador de manifesto do Deployment Engine, e os campos de
marca do White Label Runtime. Ver mapa completo em
[`docs/architecture/brighter-platform.md`](../architecture/brighter-platform.md).

## Limitações da Foundation v1

- **Não persiste nada de verdade** — `InMemoryTenantRepository` é
  demonstração/teste; cada instância some ao fim do processo.
- **Não provisiona infraestrutura** — não cria VPS, projeto Supabase, DNS,
  billing. Segue puramente informativo/consolidador, como o Deployment
  Engine.
- **Não valida se a infraestrutura declarada existe de fato** — mesma
  limitação do Deployment Engine: valida forma, não realidade externa.
- **`getCurrentInstallationTenant()` quase nunca chega a `ready: true`**
  hoje, porque referências de infra/Supabase (`provider`/`externalId`/
  `projectReference`) não são rastreadas em nenhum env var desta
  instalação — é o gap honesto que motiva a futura Control Plane.
- **Sem máquina de estado** — o motor não valida transição entre status
  comercial/técnico (ex.: não impede pular de `lead` direto pra `live`); é
  guia, documentado em `tenant-lifecycle.md`, não regra imposta em código.

## Confirmação: esta versão não provisiona nada

Nenhum arquivo de `lib/tenants/*` provisiona VPS, cria projeto Supabase,
interage com Vercel/Cloudflare, configura DNS, sobe container Docker ou faz
chamada de rede. `InMemoryTenantRepository` não persiste em disco nem banco.
A tela e a CLI são puramente leitura/relatório.
