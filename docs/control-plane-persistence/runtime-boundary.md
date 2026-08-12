---
type: architecture
status: v1
last_updated: 2026-08-12
---

# Runtime Boundary — o que existe agora vs. o que é fase futura

> Doutrina do ROADMAP: "sempre implementando as MESMAS interfaces já
> definidas, nunca reimplementando tipo/validação/simulação já existente."
> Este doc é a linha exata dessa fronteira pra Control Plane Persistence.

## Existe agora (esta fase)

- Persistência real (Supabase, tabelas `control_plane_*`) de `Tenant`,
  `Installation`, histórico de `DeploymentManifest`, `ProvisioningPlan`
  (runs + steps), conexão de provider (config sanitizada), Credentials
  Vault (referência de segredo).
- `Database*Repository` implementando as MESMAS interfaces que já existiam
  (`TenantRepository`, `InstallationRepository`) ou interfaces novas
  específicas desta fase (as 4 entidades sem repository anterior).
- Admin UI read-only mostrando dados reais.
- CLI 100% in-memory (nunca toca banco).

## NÃO existe ainda (fases futuras do ROADMAP)

### Provider Credentials Runtime

Um `vaultProvider` REAL por trás do Credentials Vault — hoje `vault_provider`
é fechado a `noop`/`in_memory`/`database_placeholder`, nenhum guarda valor
de verdade. O candidato natural é Postgres `pgp_sym_encrypt`/`pgp_sym_decrypt`
(mesmo padrão de `fn_encrypt_oauth`/`fn_decrypt_oauth`, já usado pro OAuth
do Nuvemshop desde a migration 0006) — mas isso exige: (a) uma tabela
SEPARADA pro ciphertext (nunca em `control_plane_secret_references`, que é
metadata pública por desenho), (b) função `SECURITY DEFINER` nova com
`REVOKE ALL FROM PUBLIC` + `GRANT ... TO service_role`, (c) chave de
criptografia gerenciada fora do banco. Nenhuma dessas 3 peças existe hoje.

### Real Supabase/Vercel/DNS/VPS Adapter

`lib/provisioning-adapters/` continua só contrato tipado + simulador
determinístico. `ProvisioningProviderAdapter.executeReal()` sempre lança
`RealProvisioningDisabledError`. `control_plane_provider_connections.mode`
nunca é `"real"` nesta fase.

### Provisioning/Monitoring/Billing Runtime real

`lib/monitoring/`, `lib/billing/`, `lib/outreach/`, `lib/marketplace/`
continuam Foundation v1 (in-memory, adapters fake/noop) — esta fase NÃO
deu persistência a `MonitoringSnapshot`, `MonitoringIncident`,
`BillingSubscription`, `BillingInvoice`. Ver ROADMAP.md, "Próximos" da
etapa atual.

### Workers/Scheduler

Nenhuma infraestrutura de execução assíncrona nova. `event_log` + cron
continuam a única fila (doutrina já existente do CLAUDE.md).

### Onboarding automatizado

Nenhum fluxo ponta-a-ponta que cria uma instalação nova de verdade — os
services desta fase (`createPersistedTenant`, `createPersistedInstallation`
etc.) são primitivas que um onboarding futuro vai ORQUESTRAR, não o próprio
onboarding.

### Aprovação humana pra ação destrutiva

Nenhum gate de aprovação implementado — não existe ainda nenhuma ação
destrutiva real pra aprovar (nada real é executado nesta fase).

## Nunca acessado nesta fase (confirmação estrutural, não só de intenção)

- `/opt/brighter-lumina`, porta 8000 — nenhum import, nenhuma URL, nenhuma
  referência de rede no código desta fase.
- Docker — nenhum comando `docker`/`docker compose` em nenhum script desta
  fase (o CLI é puro Node/tsx).
- DNS/Caddy — nenhum código desta fase resolve, altera ou consulta DNS.
- Qualquer provider externo (Supabase de cliente, Vercel, WhatsApp/WAHA,
  e-mail) — `mode` de conexão é sempre `dry_run`/`simulation`.
