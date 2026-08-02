---
type: architecture
status: v1 — fundação
last_updated: 2026-08-02
---

# Deployment Engine

> Fundação que transforma a configuração comercial de um cliente White Label
> (plano, módulos, marca, domínio) num manifesto técnico validado e legível —
> infraestrutura exigida, variáveis de ambiente (só nomes), blockers/warnings,
> checklist de instalação. "Deployment Engine" é nome interno; a tela voltada
> ao usuário final chama isso de "Implantação" (`/app/settings/deployment`),
> nunca a marca de quem opera a instalação.

## Objetivo

Antes desta fundação, montar a instalação de um cliente novo (Lite/Pro/
Dedicated) dependia de alguém saber de cabeça: quais módulos aquele plano
permite, que infraestrutura cada módulo exige, quais variáveis de ambiente
faltam preencher, e o que falta fazer antes de ir ao ar. Isso é conhecimento
tribal — não escala além de quem já fez a conta antes, e erra por omissão
(esquecer uma env var, esquecer que WhatsApp exige VPS).

O Deployment Engine resolve isso com uma função pura: dado um pedido
comercial (`DeploymentRequest`), devolve um manifesto (`DeploymentManifest`)
que qualquer pessoa — ou a própria tela de Configurações — consegue ler e
agir em cima. Ele **reusa** o catálogo e o resolvedor do
[Module Engine](../modules/module-engine.md) para decidir quais módulos
ligam; não reimplementa essa regra (ver `CLAUDE.md` §"Anti-patterns
proibidos" item 2 — "duplicação sem source of truth declarado").

## Arquitetura

```
lib/deployment/
  types.ts        — DeploymentRequest, DeploymentManifest e tipos auxiliares
  profiles.ts      — DEPLOYMENT_PROFILES: Lite/Pro/Dedicated (target, infra de plataforma)
  validation.ts    — validadores puros (string[] de erro, nunca lança)
  manifest.ts      — generateDeploymentManifest(): o coração da fundação
  env-template.ts  — renderEnvTemplate(): .env de exemplo, sem segredo
  index.ts         — barrel público do módulo

app/app/settings/deployment/page.tsx  — tela admin-only, somente leitura
scripts/generate-deployment-manifest.ts — CLI (pnpm deployment:manifest)
```

Nada neste módulo lê `process.env`, nada faz I/O, nada chama API externa.
`generateDeploymentManifest` é determinística: mesma entrada, mesma saída —
por isso os testes (`tests/unit/deployment-manifest.test.ts`,
`tests/unit/deployment-profiles.test.ts`) não precisam mockar ambiente nem
rede.

## Os três perfis: Lite, Pro, Dedicated

`lib/deployment/profiles.ts` define `DEPLOYMENT_PROFILES`. Cada perfil
descreve **infraestrutura de plataforma** (onde o frontend roda, se VPS/
Docker/proxy são obrigatórios) — nunca redecide quais módulos um plano
permite (isso é `ModuleDefinition.allowedPlans`, resolvido pelo Module
Engine).

| Plano | Target(s) permitido(s) | Target default | VPS | Docker | Proxy/SSL |
|---|---|---|---|---|---|
| **Lite** | `vercel`, `cloudflare` | `vercel` | Não | Não | Não |
| **Pro** | `vercel`, `cloudflare` | `vercel` | Não | Não | Não |
| **Dedicated** | `vps` | `vps` | **Sim** | **Sim** | **Sim** |

Cada perfil também declara:

- `mandatoryInfra` — infra que toda instalação daquele plano tem
  independente dos módulos pedidos (`database`, `auth` nos três).
- `forbiddenInfra` — rede de segurança declarativa. Hoje nenhum módulo
  permitido em Lite/Pro exige Redis/worker contínuo/WhatsApp, então isso
  nunca deveria disparar. Se o catálogo do Module Engine mudar e um módulo
  Lite passar a exigir infra proibida no perfil, `generateDeploymentManifest`
  emite um **warning** (não um blocker — quem decidiu isso foi o catálogo,
  não o perfil).
- `notes` — texto para humano, usado na tela e no CLI.

## Formato do `DeploymentRequest`

Entrada da função (`lib/deployment/types.ts`):

```ts
type DeploymentRequest = {
  clientName: string;
  clientSlug: string;          // vira parte de URLs/identificadores — validado
  domain: string;               // host puro, sem protocolo/caminho
  plan: "lite" | "pro" | "dedicated";
  requestedModules: string[];   // ids do catálogo do Module Engine
  disabledModules?: string[];   // espelha DISABLED_MODULES — precedência máxima
  branding: {
    appName: string;            // única obrigatória dentro de branding
    legalName?: string;
    logoUrl?: string;
    faviconUrl?: string;
    supportEmail?: string;
    websiteUrl?: string;
    fromName?: string;
    fromEmail?: string;
  };
  target?: "vercel" | "cloudflare" | "vps"; // se ausente, usa o defaultTarget do perfil do plano
};
```

## Formato do `DeploymentManifest`

Saída da função:

```ts
type DeploymentManifest = {
  client: { name: string; slug: string; domain: string };
  plan: DeploymentPlan;
  target: DeploymentTarget;
  requestedModules: string[];
  enabledModules: string[];
  rejectedModules: { moduleId: string; reason: string }[];
  infrastructure: {
    // flags agregadas dos módulos habilitados (database, auth, storage,
    // edgeFunctions, redis, worker, scheduler, whatsapp, email, ai)
    vpsRequired: boolean;
    docker: boolean;
    proxy: boolean;
  };
  environment: {
    required: string[];                     // só NOMES de env var
    optional: string[];                     // só NOMES de env var
    generatedPublicValues: Record<string, string>; // valores já públicos (branding, plano, módulos)
  };
  warnings: string[];
  blockers: string[];
  checklist: { id: string; label: string; category: string; required: boolean }[];
  valid: boolean; // true quando blockers.length === 0
};
```

`infrastructure` é a união de `requires` de todo módulo em `enabledModules`
(via `lib/modules/catalog.ts`) mais as flags de plataforma do perfil
(`vpsRequired`/`docker`/`proxy`). `checklist` é montada por
`buildChecklist()` em `manifest.ts`: itens fixos de infra (projeto Supabase,
DNS, segredos, owner bootstrap, branding) mais itens condicionais — VPS/
Redis quando `profile.vpsRequired`, conexão WAHA quando `infra.whatsapp`,
chave de IA quando `infra.ai`, provedor de e-mail (opcional) quando
`infra.email`.

## Validações

`lib/deployment/validation.ts` — cada função devolve `string[]` de erro em
vez de lançar; quem monta o manifesto decide se cada erro vira `blocker` ou
`warning`.

| Validador | Regra |
|---|---|
| `validateClientName` | não pode ser vazio |
| `validateSlug` | 2–40 chars, `^[a-z0-9]+(-[a-z0-9]+)*$` — minúsculas, números, hífen simples sem líder/final/duplo |
| `validateDomain` | host puro (sem `://` nem `/`), formato de domínio válido (regex de label + TLD) |
| `validatePlan` | precisa ser um de `DEPLOYMENT_PLANS` (`lite`/`pro`/`dedicated`) |
| `validateTarget` | precisa estar em `allowedTargets` do perfil do plano (ex.: `vps` só em `dedicated`) |
| `validateBranding` | `appName` obrigatório (blocker); `supportEmail`/`fromEmail` (email inválido) e `logoUrl`/`faviconUrl`/`websiteUrl` (URL inválida) viram **warning**, não blocker — branding incompleto não deveria travar o manifesto |
| `isKnownModuleId` | módulo precisa existir em `MODULE_CATALOG` |

Módulos pedidos passam por checagem adicional em `manifest.ts`: id
inexistente → blocker; módulo com `status: "planned"` → blocker (ainda não
implementado); módulo existente mas indisponível no plano/desligado por
dependência → blocker, com a razão vinda de `resolveModuleAvailability` do
Module Engine (`plan_not_allowed`, `explicitly_disabled`,
`dependency_disabled`, `not_enabled_by_default`).

## Blockers vs. warnings

- **`blockers`** — impede considerar a instalação válida (`valid: false`).
  Ex.: `clientSlug` vazio, domínio malformado, módulo inexistente ou
  incompatível com o plano, `target` incompatível com o plano.
- **`warnings`** — não impede o manifesto, mas sinaliza algo que merece
  atenção antes de instalar de verdade. Ex.: e-mail/URL de branding
  malformados, ou infra proibida no perfil sendo exigida por um módulo
  habilitado (sinal de divergência entre `catalog.ts` e `profiles.ts`).

Quando `plan` é inválido, a função ainda monta um manifesto legível caindo
em `"lite"` (o perfil mais restrito) só para não quebrar quem consome — mas
`valid: false` deixa explícito que aquilo não deveria ser instalado assim.

## Geração segura de variáveis de ambiente

`environment.required`/`environment.optional` contêm **apenas nomes** de
variável — auditados contra `lib/env.ts` e `.env.hostgator.example`, nunca
inventados. A lista-base (`BASE_REQUIRED_ENV`/`BASE_OPTIONAL_ENV` em
`manifest.ts`) cresce condicionalmente:

- `infra.whatsapp` → soma `WAHA_API_BASE_URL`, `WAHA_API_KEY`,
  `WAHA_WEBHOOK_BASE_URL` (obrigatórias) e `WAHA_HMAC_SECRET`,
  `WAHA_WEBHOOK_REQUIRE_SIGNATURE` (opcionais).
- `infra.ai` → soma `AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY` como
  **obrigatórias** (mesmo `lib/env.ts` tratando como opcional — sem chave o
  worker faz no-op silencioso, o que é falha funcional para um cliente
  pagante) e `OPENAI_API_KEY` como opcional.
- `infra.email` → soma `RESEND_API_KEY`/`RESEND_FROM_EMAIL` como opcionais
  (sem Resend, convites mostram link copiável na UI — não é blocker).
- `profile.vpsRequired` → soma `DOMAIN`, `ACME_EMAIL`, `APP_IMAGE`,
  `SRH_TOKEN` como obrigatórias.

`environment.generatedPublicValues` é o único lugar onde o manifesto produz
**valor**, e só para dado que já é público por natureza: nome do app, plano,
lista de módulos habilitados, URL derivada do domínio, e campos de branding
que o cliente informou (nome legal, site, e-mail de suporte, logo, favicon,
nome/e-mail de remetente). **Nunca** um segredo — nem placeholder de
segredo com valor real. Variáveis obrigatórias sem valor público (chaves,
tokens, connection strings) permanecem como nome puro em `required`.

## Template de `.env` sem segredos

`lib/deployment/env-template.ts` → `renderEnvTemplate(manifest)` gera texto
de `.env` de exemplo a partir do manifesto:

1. Cabeçalho identificando o cliente e avisando que nada ali é segredo real.
2. Todas as chaves de `generatedPublicValues`, já preenchidas.
3. Variáveis obrigatórias restantes (que não têm valor público) como
   `NOME=<CONFIGURAR>`.
4. Variáveis opcionais restantes como `NOME=` (vazio).

Nunca grava em disco — devolve string. Quem usa decide se cola num arquivo.

## Uso da CLI

`scripts/generate-deployment-manifest.ts`, exposta como `pnpm
deployment:manifest`:

```bash
pnpm deployment:manifest -- \
  --client "Empresa Exemplo" \
  --slug empresa-exemplo \
  --domain crm.empresa.com.br \
  --plan lite \
  --modules core.contacts,core.pipeline
```

Flags opcionais: `--target vercel|cloudflare|vps` · `--format json|markdown`
(default `json`) · `--env-template` (imprime também o `.env` de exemplo) ·
`--app-name` · `--legal-name` · `--logo-url` · `--favicon-url` ·
`--support-email` · `--website-url` · `--from-name` · `--from-email`.

A CLI só resolve o pedido em manifesto e imprime no terminal — não altera
`.env`, não grava segredo, não toca infraestrutura. Sai com código `!= 0`
quando o manifesto tem `blockers` (útil para travar um pipeline de
onboarding comercial antes de prosseguir).

## Limitações da Foundation v1

- **Não valida se a infra declarada está de fato disponível** — não checa
  se o Supabase informado existe, se o domínio resolve, se a VPS tem
  Docker. É validação de **forma** da configuração, não de **realidade**
  externa.
- **Não gera segredo nenhum** — nem sugestão de valor aleatório para
  `INTERNAL_SECRET`/`CPF_ENCRYPTION_KEY`/etc. Isso continua manual (ou de
  outro script), por design: o Deployment Engine não deve ser a fonte de
  segredo real de ninguém.
- **Não tem persistência** — o manifesto não é salvo em banco; cada
  chamada é stateless. A tela `/app/settings/deployment` recalcula a
  partir do estado atual do Module Engine (`lib/modules/runtime.ts`), não
  de um manifesto arquivado de quando o cliente foi instalado.
- **Não conhece o estado real do cliente comercial** — não integra com
  CRM interno da Brighter, billing ou onboarding comercial; recebe o pedido
  já pronto (`DeploymentRequest`) via CLI ou chamada direta.
- **Checklist é fixo por categoria**, não sequenciado com dependências
  entre itens (ex.: não modela "DNS só depois de VPS provisionada").

## Relação com White Label Runtime e Module Engine

```
White Label Runtime (lib/branding.ts)
        ↓ consumido por
Module Engine (lib/modules/) — catálogo + resolução de módulos por plano
        ↓ resolvido por
Deployment Engine (lib/deployment/) — manifesto técnico da instalação
```

- **White Label Runtime** define os campos de marca (`appName`, `logoUrl`,
  etc.) sem rebuild. `ClientBrandingInput` em `lib/deployment/types.ts`
  espelha esse mesmo shape como input cru do pedido comercial — não
  redefine marca, só recebe.
- **Module Engine** é a única fonte da verdade sobre quais módulos existem
  e quais planos os permitem (`MODULE_CATALOG`, `resolveModuleAvailability`).
  O Deployment Engine chama essas funções para decidir `enabledModules` e
  `rejectedModules`; nunca reimplementa a regra de disponibilidade por
  plano.
- Ver o mapa completo das fundações (incluindo as futuras — AI Engine,
  Outreach & AI Cadence Engine) em
  [`docs/architecture/brighter-platform.md`](../architecture/brighter-platform.md).

## Confirmação: esta versão não provisiona nada

O Deployment Engine Foundation v1 **não** cria, altera ou destrói qualquer
recurso real. Especificamente, esta versão:

- **Não** provisiona VPS.
- **Não** cria projeto Supabase.
- **Não** interage com a API da Vercel/Cloudflare.
- **Não** configura DNS.
- **Não** sobe, constrói ou reinicia container Docker.
- **Não** faz nenhuma chamada de rede — é código puro, sem `fetch`, sem
  cliente de infraestrutura.

Todo `lib/deployment/*.ts` carrega esse aviso no cabeçalho do arquivo de
propósito — é o invariante mais importante desta fundação, e o motivo pelo
qual ela pode ser testada inteiramente com `vitest` sem mock de rede nem
Postgres efêmero.
