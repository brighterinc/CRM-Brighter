---
type: reference
status: v1 — documentação apenas, NENHUM script real criado nesta etapa
last_updated: 2026-08-13
---

# Real Supabase Adapter — Smoke Test Real (futuro, não implementado)

**Nada neste documento foi executado nesta etapa.** Todo teste/CLI existente
hoje (`tests/unit/supabase-real-adapter-*.test.ts`,
`pnpm supabase:adapter`) usa `fetch` mockado — nenhuma chamada real à
Supabase Management API acontece no CI, nos testes ou no CLI atual.

## Por que documentar sem implementar

Um smoke test real precisa de: um token de Management API de verdade, um
projeto Supabase descartável (ou um já existente pra `project.read`), e o
gate `REAL_PROVISIONING_ENABLED=true`. Nenhuma dessas três coisas deve
existir nesta sessão/etapa (ver `docs/providers/supabase/security.md`) — daí
só o desenho, pra uma etapa futura implementar com autorização explícita.

## Desenho proposto (`pnpm supabase:adapter:smoke` — nome de exemplo, script ainda não existe)

1. **Pré-requisitos explícitos, nunca lidos por default:**
   - `REAL_PROVISIONING_ENABLED=true` (env, nunca hardcoded no script).
   - Uma credencial real cadastrada via `recordSecretReference` +
     `recordProviderConnection` (`type: "api_key"`, `provider: "supabase"`) —
     resolvida por um `RuntimeVaultProvider` REAL (nenhum existe ainda —
     ver `docs/provider-credentials-runtime/vault-providers.md`).
   - Um `--i-understand-this-is-real` (ou flag equivalente) explícito na
     linha de comando, além do gate — dupla confirmação antes de qualquer
     chamada de rede de verdade.
2. **Escopo do smoke test**: só as 3 operações `real_supported`
   (`project.validate`, `project.read`, `project.status`) — nunca
   `project.create`, que continua `dry_run_only` nesta etapa (ver
   `docs/providers/supabase/operations.md`).
3. **Saída esperada**: confirma que o token resolve (`project.validate`),
   opcionalmente lê um projeto real conhecido (`project.read`/`project.status`),
   e imprime só metadata sanitizada (nunca o token).
4. **Nunca roda em CI** — este smoke test, quando existir, é manual,
   opt-in, fora do pipeline `gov:verify`.

## Quando implementar

Só quando o usuário explicitamente pedir e fornecer/autorizar uma credencial
real de teste — não antes. Até lá, `pnpm supabase:adapter` (100% mockado)
é o único jeito de validar o comportamento do adapter.
