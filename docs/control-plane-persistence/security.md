---
type: architecture
status: v1
last_updated: 2026-08-12
---

# Segurança — Control Plane Persistence

## `assertSafePersistencePayload` — fail-closed, não mascarado

`lib/control-plane-persistence/safe-persistence.ts`. Diferente de
`sanitizeDeep` (`lib/tenants/export.ts`), que REMOVE chave sensível em
silêncio (certo pra export/log — o consumidor só queria o resto do objeto),
`assertSafePersistencePayload` **lança** `UnsafePersistencePayloadError` com
a lista exata de dot-paths ofendendo, e a persistência é recusada por
completo. A pergunta aqui não é "o que posso mostrar" — é "isso pode virar
linha no banco?", e mascarar em silêncio esconderia o bug que fez o segredo
chegar até ali.

Detecta (case-insensitive, substring, qualquer profundidade — objeto ou
array aninhado): `password`, `token`, `apiKey`, `secret`, `serviceRoleKey`,
`privateKey`, `databaseUrl`, `connectionString`, `sshKey` (via
`findSensitiveKeyPaths`, reusado de `lib/tenants/export.ts` — mesmo detector
de `sanitizeDeep`, nunca duplicado), mais `authorization`/`cookie`/`session`
(que `sanitizeDeep` não cobria — pedido explícito desta fase).

Roda em DUAS camadas — defesa em profundidade, nunca confiar só na de cima:

1. **Serviço** (`services.ts`) — no payload bruto, antes de qualquer I/O.
2. **Repository** (`repositories/*.ts`, `vault/*.ts`) — de novo, no que
   realmente vai virar `INSERT`/`UPDATE`.

## Audit trail — dois logs, propósitos diferentes

| Log | Tabela | Pergunta que responde | Retenção |
|---|---|---|---|
| `api_audit_log` (via `emitAudit`) | `api_audit_log` | "Quem fez essa mutação, quando, de onde" | 5 anos (doutrina LGPD já existente) |
| Operation events | `control_plane_operation_events` | "O que aconteceu com esta instalação, na ordem" | Append-only, sem retenção definida por esta fase |

**Não é duplicação** — mesmo padrão de `BillingEvent`/`ProvisioningLogEntry`,
que já existem noutras Foundations com o mesmo motivo: `api_audit_log` é
genérico e ator-cêntrico (qualquer mutação do sistema todo); operation
events é um domínio próprio, rico, específico de Control Plane (tem
`provisioningRunId`, `installationId`, `severity` como eixo de saúde) —
serve a UI da timeline de uma instalação, não o audit log genérico.

Toda função de `services.ts` emite os dois juntos. `emitAudit` é injetado
(`ControlPlaneActorContext.emitAudit`, default = `import("@/lib/audit")`
sob demanda) — nunca importado estaticamente no topo de `services.ts`
porque `lib/audit/index.ts` valida env do Supabase na hora do import; CLI e
testes in-memory passam um `emitAudit` no-op.

## `metadata`/`config`/`manifest_snapshot` — sempre sanitizado antes de gravar

Toda coluna `jsonb` que pode carregar dado arbitrário
(`control_plane_operation_events.metadata`,
`control_plane_provider_connections.config`,
`control_plane_deployments.manifest_snapshot`) passa por
`assertSafePersistencePayload` antes do INSERT — nunca confia que o
chamador já sanitizou.

## O que NÃO está coberto nesta fase

- Rate limit — não há rota `/api/v1/` pública nesta fase (só service layer +
  admin UI Server Component), então não se aplica ainda.
- MFA — herdado de `requirePlatformAdmin()` (força AAL2 se
  `platform_admins.mfa_required`), reusado sem mudança.
- Teste de isolamento RLS real (`test:db`) — documentado (`rls.md`), não
  executado nesta sessão (proibido tocar banco real).
