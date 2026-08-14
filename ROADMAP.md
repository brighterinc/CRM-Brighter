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
- **Brighter Provisioning Engine Foundation v1** — transforma um `Tenant` +
  seu `DeploymentManifest` num plano de execução ORDENADO: catálogo
  canônico de etapas, dependências (com detecção de ciclo), status por
  etapa e por run, blockers/warnings, fingerprint determinístico (sem
  segredo), dry-run/simulação determinística, plano de rollback teórico
  (nunca executado) e logs estruturados sanitizados. Executor abstrato só
  com adaptadores fake/noop (`NoopProvisioningAdapter`,
  `InMemoryProvisioningAdapter`) — nenhuma infraestrutura real é criada.
  Tela admin somente-leitura (`/app/settings/provisionamento`) e CLI
  (`pnpm provisioning:plan`). Mesma doutrina de camada de domínio pura das
  fundações anteriores: sem persistência real (plano recalculado em
  memória a cada chamada), sem tabela, sem migration. `lib/provisioning/`.
  Ver `docs/provisioning/provisioning-engine.md`,
  `docs/provisioning/provisioning-lifecycle.md` e
  `docs/provisioning/rollback-strategy.md`.

- **Brighter Control Plane Foundation v1** — agrega TODAS as instalações
  White Label da Brighter num único tipo (`Installation` = `Tenant` +
  `DeploymentManifest` + `ProvisioningSummary` + branding + módulos), com
  vocabulário PRÓPRIO de status (`InstallationStatus`/`CommercialStatus`/
  `TechnicalStatus` — a visão da Brighter sobre a instalação, distinta do
  `commercialStatus`/`technicalStatus` que o próprio `Tenant` já rastreia
  sobre si mesmo), catálogo de metadados de status (label/descrição/
  categoria), validação estrutural que impede `deployment`/`branding`/
  `modules` divergirem do `tenant` embutido, repositório in-memory
  (`InMemoryInstallationRepository`) com create/update/archive/list/find/
  filter/countByStatus, filtros compostos (plano/status/domínio/empresa/
  módulo/marca/data) e resumo agregado (dashboard). Tela admin
  somente-leitura (`/app/settings/control-plane`) e CLI
  (`pnpm control:summary`). Mesma doutrina de camada de domínio pura das
  fundações anteriores: sem persistência real, sem tabela, sem migration,
  sem API, sem Docker/VPS/Supabase/DNS. `lib/control-plane/`. Ver
  `docs/control-plane/control-plane.md`, `docs/control-plane/lifecycle.md`
  e `docs/control-plane/status.md`.

- **Brighter Monitoring Engine Foundation v1** — representa, calcula e
  resume a saúde operacional de cada instalação White Label a partir do
  agregado `Installation` da Control Plane. Catálogo canônico de ~37 checks
  (aplicação, domínio, DNS, SSL, banco, auth, storage, Redis, worker,
  scheduler, e-mail, WhatsApp/WAHA, backup), filtrados por plano + módulos
  habilitados + infraestrutura do manifesto (nunca exige Redis/worker/
  scheduler no Lite, nunca exige WhatsApp sem `channel.whatsapp` ativo).
  Motor de avaliação determinístico (saúde geral, score 0–100, blockers/
  warnings, checks ausentes/atrasados), incidentes derivados dos checks em
  falha (open/acknowledged/investigating/resolved/ignored, com
  deduplicação), repositório in-memory (`InMemoryMonitoringRepository`),
  adaptadores fake/noop (`NoopMonitoringAdapter`, `InMemoryMonitoringAdapter`,
  `FakeMonitoringAdapter`) e simulação determinística
  (`simulateMonitoringRun`, 13 cenários). Integração com a Control Plane via
  view model próprio (`attachMonitoringSnapshotToInstallationSummary`),
  sem alterar `lib/control-plane/*`. Tela admin somente-leitura
  (`/app/settings/monitoramento`) e CLI (`pnpm monitoring:summary`). Mesma
  doutrina de camada de domínio pura das fundações anteriores: nenhum
  check real, sem persistência real, sem tabela, sem migration, sem API,
  sem cron/worker reais. `lib/monitoring/`. Ver
  `docs/monitoring/monitoring-engine.md`,
  `docs/monitoring/monitoring-lifecycle.md`, `docs/monitoring/incidents.md`
  e `docs/monitoring/check-catalog.md`.

- **Brighter Billing Engine Foundation v1** — domínio comercial/financeiro
  de cada instalação White Label a partir do agregado `Installation` da
  Control Plane. Catálogo comercial (Lite/Pro/Dedicated, preços placeholder
  de demonstração — valor real fica pra futura configuração na Control
  Plane), assinatura com máquina de estados (draft/trial/active/past_due/
  grace_period/suspended/cancelled/expired), invoice em centavos (nunca
  ponto flutuante, total nunca negativo), descontos percentuais/fixos e
  créditos, entitlement de módulo (`resolveBillingEntitlements` — nunca
  concede o que o Module Engine já negou; `DISABLED_MODULES` mantém
  precedência; assinatura suspensa nunca remove dado, módulos `core.*`
  seguem acessíveis em modo restrito), consumo vs. limites contratados
  (só recomenda, nunca bloqueia), upgrade imediato/downgrade agendado pro
  fim do período, cancelamento imediato/ao fim do ciclo, eventos de
  domínio, repositório in-memory (`InMemoryBillingRepository`),
  adaptadores fake/noop de provedor de pagamento (`NoopBillingProviderAdapter`,
  `FakeBillingProviderAdapter` — sem InfinitePay/Stripe/Mercado Pago/Pix/
  boleto/cartão) e simulação determinística (`simulateBillingScenario`, 22
  cenários). Integração com a Control Plane via view model próprio
  (`attachBillingSummaryToInstallationSummary`), sem alterar
  `lib/control-plane/*`; separação estrutural de responsabilidade com o
  Monitoring Engine (Billing nunca decide saúde técnica, Monitoring nunca
  decide cobrança). Tela admin somente-leitura (`/app/settings/billing`) e
  CLI (`pnpm billing:summary`). Mesma doutrina de camada de domínio pura
  das fundações anteriores: sem gateway, sem cobrança real, sem nota
  fiscal, sem persistência real, sem tabela, sem migration, sem API.
  `lib/billing/`. Ver `docs/billing/billing-engine.md`,
  `docs/billing/subscription-lifecycle.md`,
  `docs/billing/invoices-and-payments.md`,
  `docs/billing/entitlements-and-limits.md` e
  `docs/billing/provider-adapters.md`.

- **Brighter Automation Engine Foundation v1** — modela "o que uma
  instalação White Label PODE automatizar": gatilhos, condições, ações,
  ramificação (branch onSuccess/onFailure), delay, retry, idempotência
  (de RUN via fingerprint determinístico, e de ETAPA — nunca reexecuta
  uma etapa `completed`) e histórico sanitizado, como domínio puro de
  simulação determinística. Catálogo de 8 gatilhos + 5 ações (mesmos ids
  conceituais do motor legado `lib/automation/`, documentados via
  `legacyActionType`, nunca importados — zero acoplamento nas duas
  direções). Executor abstrato caminha o grafo de ramificação uma etapa
  por vez, só com adaptadores fake/noop (`NoopWorkflowActionAdapter`,
  `InMemoryWorkflowActionAdapter`); delay/retry nunca usam
  `setTimeout`/cron real — só calculam `nextAttemptAt`, quem avança o
  relógio é sempre quem chama. Validação de entitlement reusa
  `MODULE_CATALOG` (módulo `status: "planned"` — ex. `automation.campaigns`
  — nunca autorizado, mesma regra do Billing Engine), repositório
  in-memory (`InMemoryWorkflowRepository`) com `createDemoWorkflows()`, e
  simulação determinística (`simulateWorkflowRun`, 8 cenários: sucesso
  completo, retry-então-sucesso, retry esgotado com fallback, fallback
  também falha, gatilho duplicado ignorado por idempotência, etapa em
  delay sem resolver, workflow inativo, módulo não autorizado). Tela
  admin somente-leitura (`/app/settings/automacao`) e CLI (`pnpm
  automation:summary`). Mesma doutrina de camada de domínio pura das
  fundações anteriores: sem execução real, sem agendamento real, sem
  persistência real, sem tabela, sem migration, sem API.
  `lib/automation-engine/`. Ver `docs/automation/automation-engine.md`,
  `docs/automation/workflow-lifecycle.md` e
  `docs/automation/action-catalog.md`.

- **Brighter Outreach & AI Cadence Engine Foundation v1** — modela o
  domínio COMERCIAL de outreach/cadência: campanhas, segmentos, audiência,
  cadências multi-etapa (grafo de `OutreachCadenceStep`), janela de envio,
  throttling (valores reais de `lib/automation/throttle.ts`/CLAUDE.md
  §WAHA — nunca inventados), templates + personalização (variáveis fixas
  nomeadas, nunca dot-path livre/`eval`), consentimento/opt-out
  (`contacts.is_blocked`/`consent` espelhados, opt-out sempre com
  precedência), respostas + classificação por IA opcional (`ai.agents`,
  adaptadores `Noop`/`Fake` determinísticos por palavra-chave, nunca IA
  externa), handoff humano (preview, nunca atribui vendedor real) e
  métricas de campanha, como domínio puro de simulação determinística.
  TODA entrada do catálogo de campanha exige `automation.campaigns`
  (`status: "planned"` no Module Engine — nunca autorizado em produção
  nesta Foundation, mesma regra do Automation/Billing Engine). Integra
  (sem duplicar) as seis fundações anteriores: `Installation`/
  `MODULE_CATALOG` (autorização), `resolveBillingEntitlements` (limite de
  plano), `MonitoringSnapshot` (saúde de canal), view model pro Automation
  Engine (`mapCadenceToAutomationView`/`mapEnrollmentToAutomationExecutionView`
  — nunca um `WorkflowDefinition` real) e attach pro resumo da Control
  Plane. Repositório in-memory (`InMemoryOutreachRepository`) com
  `createDemoCampaigns()`, e simulação determinística
  (`simulateOutreachScenario`, 24 cenários). Tela admin somente-leitura
  (`/app/settings/outreach`) e CLI (`pnpm outreach:summary`). Mesma
  doutrina de camada de domínio pura das fundações anteriores: sem envio
  real, sem IA real, sem agendamento real, sem persistência real, sem
  tabela, sem migration, sem API. `lib/outreach/`. Ver
  `docs/outreach/outreach-engine.md` e os demais docs em `docs/outreach/`.

- **Brighter Marketplace / Module Licensing Foundation v1** — modela a
  OFERTA COMERCIAL de módulos e o ESTADO DA LICENÇA de cada módulo por
  instalação: catálogo comercial (`MarketplaceModuleDefinition`, sempre
  derivado do `MODULE_CATALOG` técnico), ofertas e bundles (nomes de
  demonstração neutros — CRM Essencial, CRM + WhatsApp, Omnichannel,
  Comercial Pro, Dedicated Operations), licenças (`ModuleLicense`, 5o eixo
  de status — `LicenseStatus`, distinto de `ModuleStatus`/
  `SubscriptionStatus`/`InstallationStatus`/`TenantCommercialStatus`),
  trials (nunca passam por Billing), elegibilidade prospectiva
  (`evaluateModuleEligibility`) x entitlement de estado atual
  (`resolveMarketplaceEntitlements` — nunca concede além do Module Engine
  nem do Billing), plano de ativação teórico (`generateModuleActivationPlan`
  — nunca ativa módulo, nunca edita `.env`, nunca faz deploy) e
  versionamento SemVer simplificado, como domínio puro de simulação
  determinística. Integra (sem duplicar) as sete fundações anteriores:
  `MODULE_CATALOG`, `resolveBillingEntitlements`, `MonitoringSnapshot`,
  view model pra Provisioning e attach pro resumo da Control Plane.
  Repositório in-memory (`InMemoryMarketplaceRepository`), adaptadores
  fake/noop e simulação determinística (`simulateMarketplaceScenario`, 26
  cenários). Tela admin somente-leitura (`/app/settings/modulos-licencas`)
  e CLI (`pnpm marketplace:summary`). Mesma doutrina de camada de domínio
  pura das fundações anteriores: sem ativação real, sem cobrança real, sem
  provisionamento real, sem persistência real, sem tabela, sem migration,
  sem API. `lib/marketplace/`. Ver `docs/marketplace/marketplace-engine.md`
  e os demais docs em `docs/marketplace/`.

- **Brighter Provisioning Adapters Foundation v1** — traduz uma etapa
  ABSTRATA do Provisioning Engine pra um provider CONCRETO (Supabase,
  Vercel, DNS, VPS, Docker, Reverse Proxy, Redis, Email, WhatsApp,
  Chatwoot, Evolution, WAHA, Noop, Fake) — só como contrato tipado,
  blueprint e simulador determinístico. Catálogo de capabilities por
  provider, mapeamento etapa→provider/operação (17 etapas mapeadas
  estaticamente, 2 condicionadas ao `target` — `configure_domain`/
  `configure_ssl` —, 12 sem provider nesta fundação porque não há
  "monitoring"/"ai" na lista de 14), registry sem singleton mutável,
  mapper puro com idempotency key SHA-256, executor de dry-run que
  respeita ordem/dependências/blockers do `ProvisioningPlan` (propagando
  bloqueio em cascata quando um provider está ausente), rollback preview
  por provider, repositório in-memory, e simulação determinística
  (`simulateProvisioningAdapterScenario`, 22 cenários). `mode: "real"`
  existe só como tipo reservado — `executeReal()` sempre lança
  `RealProvisioningDisabledError`. Integra (sem duplicar) o Provisioning
  Engine, o Marketplace (deriva providers tocados a partir de
  `ModuleDefinition.requires`, nunca faz parsing de texto livre) e a
  Control Plane. Tela admin somente-leitura
  (`/app/settings/provisioning-adapters`) e CLI
  (`pnpm provisioning:adapters`). Mesma doutrina de camada de domínio pura
  das fundações anteriores: nenhum provider real executado, nenhuma API
  externa chamada, nenhum Docker executado, sem persistência real, sem
  tabela, sem migration. `lib/provisioning-adapters/`. Ver
  `docs/provisioning-adapters/overview.md` e os demais docs em
  `docs/provisioning-adapters/`.

**FOUNDATIONS: concluídas.** As 12 fundações estruturais (contratos
tipados, blueprints, simuladores determinísticos — nunca execução real)
mais a Control Plane Persistence abaixo (primeira a ganhar persistência
real de verdade) fecham a fase de "criar fundação nova". Daqui em diante é
"dar execução real às fundações que já existem", sempre implementando as
MESMAS interfaces já definidas (nunca reimplementando tipo/validação/
simulação já existente).

## RUNTIME REAL / CONTROL PLANE

### Atual

**Control Plane Persistence + Credentials Vault** — persistência real
(Supabase, banco próprio da Brighter, 8 tabelas `control_plane_*`,
migration `0098_control_plane_persistence`) de `Tenant`/`Installation`/
histórico de `DeploymentManifest`/`ProvisioningPlan` (runs + steps)/conexão
de provider, implementando as MESMAS interfaces `TenantRepository`/
`InstallationRepository` já definidas (`Database*Repository` ao lado dos
`InMemory*` existentes, troca explícita via factory) — mais o Credentials
Vault (`CredentialsVault`: `createReference`/`resolveReferenceMetadata`/
`rotateReference`/`revokeReference`/`validateReference`, sem
`getSecretValue()`), que é peça inteiramente nova. RLS restrita a
`fn_is_platform_admin()` em todas as 8 (reuso puro do helper já existente,
nenhuma tabela tenant-aware — Control Plane não é dado de `organizations`
desta CRM). AINDA NÃO conecta nenhum provider real nem guarda nenhum
segredo de verdade — `docs/control-plane-persistence/runtime-boundary.md`
é a linha exata. Migration criada e revisada, **não aplicada** — ver
`docs/control-plane-persistence/migration.md`. `lib/control-plane-persistence/`.
Ver `docs/control-plane-persistence/overview.md`.

**Provider Credentials Runtime** — a camada runtime que resolve
`secretReferenceId` → VALOR só em memória, pelo menor tempo possível,
dentro de um boundary controlado (`withProviderCredential()`), sem nunca
expor esse valor ao domínio/UI/logs/banco. `RuntimeVaultProvider` (contrato
separado do `CredentialsVault` de persistência) com 3 implementações desta
fase — `Noop`/`InMemory`/`Environment` (nenhuma real) —, policy engine
default-deny (`evaluateProviderCredentialAccess`, cruza tenant/
installation/provider/secret reference/provider connection/purpose/
operation, nega cross-tenant mesmo com `ProviderConnection` "válida"
apontando errado), `CredentialLease` (ciclo de vida `created → active →
consumed → released`, mais `expired`/`revoked`/`failed`, single-use por
padrão, in-memory nesta fase), detecção ESTRUTURAL de escape de credencial
(a credencial nunca sai do callback, mesmo embutida em profundidade sob
chave inocente), e integração com `ProvisioningAdapterCapability`
(`requiredCredentialPurpose`/`requiredSecretType`, campos aditivos
`string` solto pra evitar import circular). 11 cenários de simulação
(`pnpm credentials:runtime`), admin UI read-only. AINDA NÃO implementa um
vault real nem executa nenhum provider real — orquestra só o BOUNDARY que
um vault/provider real vai usar depois. `lib/provider-credentials-runtime/`.
Ver `docs/provider-credentials-runtime/overview.md`.

**Real Supabase Adapter** — primeiro provider REAL da Provisioning Adapters.
8 operações (`project.validate`/`project.create`/`project.read`/
`project.status`/`database.prepare`/`auth.configure`/`storage.prepare`/
`edge_functions.prepare`), classificadas `REAL_SUPPORTED` (só
`project.validate`/`project.read`/`project.status` de fato chamam a
Supabase Management API), `DRY_RUN_ONLY` (`project.create` — request
preparado/validado, NUNCA executado nesta etapa, mesmo com o gate ligado)
ou `PLANNED` (as 4 de configuração, reservadas). Gate
`REAL_PROVISIONING_ENABLED` (default `false`, lido direto de `process.env`
pra não acoplar CLI/teste a `lib/env.ts`) — duas camadas independentes de
bloqueio junto com a classificação por operação. Cliente HTTP mínimo
(`SupabaseManagementClient`, timeout via `AbortController`, nunca loga
`Authorization`/body), retry só em timeout/429/5xx-selecionado (nunca em
400/401/403/404/409), chave de idempotência (hash de tenant/installation/
operation/input sanitizado, nunca credencial), rollback preview (só
`project.create` é teoricamente reversível — nunca executado). Usa
`withProviderCredential()` (Provider Credentials Runtime, acima) — nunca lê
`vault_key` direto; emite eventos `provider_operation.*` na Control Plane
Persistence (vocabulário aberto, sem migration). Implementa o mesmo
contrato `ProvisioningProviderAdapter` do blueprint dry-run, mas NÃO
registrado no registry default (`createDefaultProvisioningAdapterRegistry()`)
— esse continua seguro de importar sem tocar env/rede; quem quer o adapter
real monta a própria instância via `createRealSupabaseProvisioningAdapter(deps)`.
40 testes unitários (`tests/unit/supabase-real-adapter-*.test.ts`, `fetch`
mockado, nenhuma chamada real), CLI 100% mockado (`pnpm supabase:adapter`),
admin UI read-only (`/app/settings/control-plane/providers/supabase`).
`lib/provisioning-adapters/providers/supabase-real*.ts`. Ver
`docs/providers/supabase/overview.md`.

### Próximos

1. **Vault Backend Real** — um `RuntimeVaultProvider` REAL plugado no
   `RuntimeVaultProviderRegistry` já existente (candidato: Postgres
   `pgp_sym_encrypt`, mesmo padrão do OAuth do Nuvemshop,
   `fn_encrypt_oauth`/`fn_decrypt_oauth` — mas com tabela de ciphertext
   SEPARADA de `control_plane_secret_references` e função `SECURITY
   DEFINER` própria, nunca reusando as do Nuvemshop). O Real Supabase
   Adapter (acima) ainda resolve credencial via vault provider de
   teste/simulação — sem isto, `REAL_PROVISIONING_ENABLED=true` não tem
   token de verdade pra usar.
2. **Real Vercel Adapter** — mesmo padrão do Real Supabase Adapter, pra
   `vercel`.
3. **DNS Provider Adapter** — idem, pra `dns` (e `configure_ssl`).
4. **Provisioning Runtime** — orquestra os adapters reais acima dentro do
   `ProvisioningPlan` já persistido, executando de fato as etapas hoje só
   dry-run/simuladas.
5. **Monitoring Runtime** — persistência real de `MonitoringSnapshot`/
   `MonitoringIncident` + adaptadores reais de `MonitoringAdapter` (ping
   HTTP, DNS, SSL, Supabase, Redis, WAHA), plugados no motor já existente em
   `lib/monitoring/` sem mudar sua interface.
6. **Billing Runtime** — persistência real de `BillingSubscription`/
   `BillingInvoice` + adaptadores reais de `BillingProviderAdapter`
   (InfinitePay/Stripe/Mercado Pago/Pix/boleto), plugados em
   `lib/billing/adapters.ts` sem mudar sua interface.
7. **Outreach Runtime** — adapta `OutreachChannelAdapter`/
   `ResponseClassifier`/`ResponseDraftGenerator` reais (WAHA/Meta Cloud/
   SMTP/SMS, Vercel AI Gateway) plugados nas interfaces já existentes em
   `lib/outreach/adapters.ts`, mais persistência real de `OutreachCampaign`/
   `OutreachCadence`/`OutreachEnrollment`.
8. **Worker/Scheduler Runtime** — infraestrutura de execução assíncrona
   (`event_log` + cron, doutrina já existente do CLAUDE.md) pra rodar
   provisionamento/automação/outreach de verdade fora do request-response.
9. **Automated Client Onboarding** — fluxo ponta a ponta que efetivamente
    cria uma instalação nova, orquestrando os services de
    `lib/control-plane-persistence/services.ts` sobre os runtimes reais
    acima.

Não implementados agora (itens 1-10 acima são só o roadmap ordenado).
Cross-cutting que continua pendente, sem item numerado próprio: observabilidade/
auditoria real de execução (hoje só a trilha de `control_plane_operation_events`
sobre as MUTAÇÕES de persistência, não sobre execução real de infra),
rollback real (hoje só `rollbackPreview` textual), aprovação humana
obrigatória antes de qualquer rollback/desativação real, Automation Adapters
Foundation (`WorkflowActionAdapter` real em `lib/automation-engine/executor.ts`),
Marketplace Adapters real (`lib/marketplace/adapters.ts`, hoje só Noop/Fake),
suporte e SLA formal por tenant.

**Nota sobre IA:** IA é capacidade opcional consumida por módulos
específicos (`ai.agents`/`ai.memory`/`ai.rag`, e futuros módulos de
Outreach/Atendimento/Comercial) — não é uma engine estrutural
independente. Removida do roadmap como fundação própria.
