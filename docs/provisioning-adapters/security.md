---
type: reference
status: v1 — fundação
last_updated: 2026-08-09
---

# Segurança — Provisioning Adapters Foundation v1

## Garantias "nunca real" desta fundação

- Nenhum arquivo em `lib/provisioning-adapters/providers/*.ts` importa
  `fetch`, `axios`, SDK de provider, `child_process`, `docker` ou qualquer
  I/O externo.
- `executeReal()` em TODO adapter sempre lança `RealProvisioningDisabledError`
  — nunca implementado de fato (ver `provider-contract.md`).
- `realExecutionAvailable` em TODA `ProvisioningAdapterCapability` é sempre
  `false` — verificado em `validation.ts::validateCapabilityCatalog`, que
  falha se algum dia uma capability declarar `true`.
- `mode: "real"` existe só como literal de tipo reservado — nenhum construtor
  desta fundação o produz.
- Nenhum arquivo lê `process.env` — seguro importar `lib/provisioning-adapters`
  de qualquer lugar, inclusive CLI (mesma garantia de `lib/provisioning/`).

## Sanitização

`sanitization.ts` reusa `sanitizeDeep` (`lib/tenants/export.ts`) — a MESMA
função que `lib/billing/`, `lib/monitoring/`, `lib/automation-engine/`,
`lib/outreach/` e `lib/marketplace/` já reusam (CLAUDE.md anti-pattern #2).
Nunca reimplementa a regex de chaves sensíveis.

Pontos de sanitização:

- `mapper.ts` sanitiza `input` antes de montar o `ProvisioningAdapterRequest`
  — nunca inclui segredo, nunca lê `process.env`.
- `providers/base.ts` sanitiza `output` antes de devolver
  `ProvisioningAdapterResult`.
- `sanitizeAdapterRequestForLog`/`sanitizeAdapterResultForLog`/
  `sanitizeRollbackPreview`/`sanitizeAdapterSummaryPayload` cobrem logs,
  resumos e rollback previews.

Chaves banidas (herdadas de `SENSITIVE_KEY_PATTERN`, `lib/tenants/export.ts`):
`password`, `token`, `apiKey`, `secret`, `serviceRole`, `databaseUrl`,
`connectionString`, `sshKey`, `privateKey` (case-insensitive, casa
substring — cobre `authorization`, `cookie`, `session`, `refreshToken`,
`accessToken`, `providerToken`, `webhookSecret`, `dnsToken`, `vercelToken`,
`supabaseToken`, `hostingerToken`, `cloudflareToken`, `evolutionApiKey`,
`chatwootToken`, `wahaApiKey` por conterem `token`/`secret`/etc como
substring).

## Idempotência sem vazamento

`buildAdapterIdempotencyKey` (`mapper.ts`) usa SHA-256 sobre um objeto
estável (`tenantId`, `installationId`, `stepId`, `provider`, `operation`,
`input` JÁ SANITIZADO, `planFingerprint`) — nunca inclui segredo porque o
`input` que entra na chave já passou por `sanitizeAdapterInput`.

## RBAC da tela admin

`/app/settings/provisioning-adapters` exige `requireAuth()` +
`resolveActiveOrg()` + `ROLE_RANK[role] >= ROLE_RANK.admin` (ou
`is_platform_admin`) — mesmo padrão de `/app/settings/modulos-licencas`.
Redireciona pra `/403` sem essa permissão. Tela é **somente leitura** — sem
nenhum botão de execução real.

## Auditoria desta sessão (confirmações)

- Nenhuma chamada de rede foi feita.
- Nenhum provider real foi executado.
- Nenhum Docker foi executado.
- Nenhum `.env` real foi alterado.
- Nenhum deploy foi executado.
- `/opt/brighter-lumina` não foi acessado nem referenciado.
