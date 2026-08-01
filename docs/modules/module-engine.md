---
type: architecture
status: v1 — fundação
last_updated: 2026-08-01
---

# Module Engine

> Fundação modular que permite o mesmo código atender operação interna e clientes
> White Label em três modelos de implantação, sem manter três bases de código.
> "Module Engine" é nome interno — telas e copy voltadas ao usuário final usam
> linguagem neutra ("Módulos", "Recursos disponíveis", "Plano de implantação"),
> nunca a marca de quem opera a instalação.

## Por que existe

Cada instalação White Label roda em um de três modelos:

| Plano | Infra | Uso típico |
|---|---|---|
| **Lite** | Frontend hospedado + Supabase Auth/Postgres/Storage. Sem VPS obrigatória. | Cliente que só precisa de CRM + IA sem canal WhatsApp próprio. |
| **Pro** | Idem Lite + automações leves (Edge Functions, integrações gerenciadas). | Cliente com necessidade de automação sem operar infraestrutura própria. |
| **Dedicated** | VPS exclusiva: Docker, Redis, workers, scheduler, WhatsApp (WAHA), IA contínua, monitoramento e backup próprios. | Operação completa — é o modelo usado hoje pela Brighter e por clientes que precisam de WhatsApp. |

Sem uma camada central, "suportar os três" viraria três forks ou um emaranhado de
`if (cliente === X)` espalhado pelo código. O Module Engine resolve isso com um
catálogo tipado + resolução por variável de ambiente: a MESMA imagem/deploy
liga ou desliga pedaços do produto conforme o plano contratado.

## Arquitetura

```
lib/modules/
  catalog.ts   — fonte canônica: MODULE_CATALOG (o que existe, tipado)
  resolver.ts  — funções puras: o que fica ligado, dado plano + overrides de env
  runtime.ts   — singleton: lê process.env UMA vez, expõe API de consulta
  guard.ts     — requireModule(id): proteção de rota (Server Components)
```

### `catalog.ts` — `ModuleDefinition`

```ts
type DeploymentPlan = "lite" | "pro" | "dedicated";

type ModuleInfraRequirements = {
  database?: boolean; auth?: boolean; storage?: boolean; edgeFunctions?: boolean;
  redis?: boolean; worker?: boolean; scheduler?: boolean; whatsapp?: boolean;
  email?: boolean; ai?: boolean;
};

type ModuleDefinition = {
  id: string;                    // "core.contacts", "channel.whatsapp", ...
  name: string;
  description: string;
  category: string;              // core | channel | ai | automation | integration | compliance | analytics
  defaultEnabled: boolean;
  allowedPlans: DeploymentPlan[];
  requires: ModuleInfraRequirements;
  dependsOn?: string[];
  routes?: string[];
  permission?: string;
  status: "stable" | "beta" | "planned";
};
```

`MODULE_CATALOG` é a única fonte da verdade sobre o que existe. Nada mais no
código deve declarar módulo em outro lugar.

### Variáveis de ambiente

```
DEPLOYMENT_PLAN=lite|pro|dedicated   # fallback: "dedicated" (ausente/inválido)
ENABLED_MODULES=id1,id2              # força ligar (não vence allowedPlans nem DISABLED_MODULES)
DISABLED_MODULES=id3,id4             # força desligar — precedência máxima
```

Ver `.env.example` / `.env.hostgator.example` para os comentários de uso.

### Precedência de resolução (por módulo, em ordem)

1. **`DISABLED_MODULES`** → sempre desligado. Vence tudo.
2. **Fora de `allowedPlans`** → nunca liga, mesmo listado em `ENABLED_MODULES`.
   Ex.: `channel.whatsapp` só existe em `dedicated` — um cliente Lite não
   consegue ligá-lo nem forçando a env var.
3. **Dependência (`dependsOn`) desligada** → desliga em cascata. Ex.: se
   `core.contacts` está em `DISABLED_MODULES`, todo módulo que depende dele
   (direta ou indiretamente) desliga junto. Gera `logger.warn` estruturado —
   é uma escolha de configuração do operador, não uma falha de infraestrutura,
   então não lança exceção no boot.
4. **`ENABLED_MODULES`** → liga.
5. **`defaultEnabled`** → liga.
6. Caso contrário → desligado, motivo `"not_enabled_by_default"`.

Toda essa lógica é pura (`lib/modules/resolver.ts`, sem `process.env`) — testada
em `tests/unit/modules-resolver.test.ts` sem precisar mockar variável de
ambiente.

### Compatibilidade com instalações existentes

Uma instalação Dedicated já em produção, sem `DEPLOYMENT_PLAN`/`ENABLED_MODULES`/
`DISABLED_MODULES` setados, precisa continuar se comportando exatamente como
hoje. Isso é garantido por dois pontos do design:

- `resolveDeploymentPlan(undefined)` → `"dedicated"` (o plano mais permissivo,
  e o único que existia antes desta fundação).
- Todo módulo já em produção (`core.*`, `channel.whatsapp`, `channel.email`,
  `ai.agents`, `ai.memory`, `ai.rag`, `automation.webhooks`,
  `automation.followups`, `integration.nuvemshop`, `compliance.lgpd`,
  `analytics.metrics`) nasce com `defaultEnabled: true`.

Só módulos com `status: "planned"` (`automation.campaigns`,
`integration.lumina`, `integration.sphere` — nada implementado ainda) nascem
`defaultEnabled: false`.

## Consumindo o Module Engine

```ts
import { isModuleEnabled, getEnabledModules, getDeploymentPlan } from "@/lib/modules/runtime";
import { requireModule } from "@/lib/modules/guard";
```

- **Proteção de rota (Server Component):** chame `requireModule("ai.agents")`
  logo depois de `requireAuth()`. Se o módulo estiver desligado, a página
  responde 404 nativo (`notFound()`) — nunca renderiza parcialmente, e não
  interfere no fluxo de autenticação (que já rodou antes). Ver
  `app/app/ai/agents/page.tsx`, `app/app/webhooks/page.tsx`,
  `app/app/connections/page.tsx` como referência.
- **Sidebar:** itens de navegação declaram `moduleId` opcional
  (`components/shell/Sidebar.tsx`); `isNavItemVisible()` (função pura,
  testada) esconde o item se o módulo estiver desligado — sem duplicar a
  checagem de permissão já existente.
- **Tela de módulos (somente leitura, admin):** `/app/settings/modules` lista
  o catálogo inteiro com estado atual e motivo quando indisponível, via
  `getModuleAvailability()`.

`lib/modules/runtime.ts` é o ÚNICO lugar que lê as 3 env vars — nenhum outro
arquivo deve ler `process.env.DEPLOYMENT_PLAN` (ou as outras duas) diretamente.

## Adicionando um módulo novo

1. Adicione a entrada em `MODULE_CATALOG` (`lib/modules/catalog.ts`) com
   `status: "planned"` até a feature existir de verdade.
2. Se a feature depende de outro módulo do catálogo, declare em `dependsOn`.
3. Declare `requires` (infra real que a feature vai precisar) — usado hoje só
   para exibição na tela de módulos, não valida infra de fato.
4. Proteja a(s) rota(s) nova(s) com `requireModule(id)`.
5. Se a feature tiver item de sidebar, adicione `moduleId` ao `NavItem`.
6. Promova `status` para `"beta"`/`"stable"` e `defaultEnabled` conforme o
   módulo amadurece.

## O que esta fundação NÃO faz (v1)

- Não valida se a infra declarada em `requires` está de fato disponível
  (ex.: não checa se Redis está acessível).
- Não permite editar módulos pelo frontend — a fonte da verdade é o ambiente.
- Não implementa nenhum módulo comercial novo (`automation.campaigns`,
  `integration.lumina`, `integration.sphere` seguem `planned`).
