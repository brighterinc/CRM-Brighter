---
type: architecture
status: v1
last_updated: 2026-08-12
---

# RLS — Control Plane Persistence

## Regra única, em todas as 8 tabelas

```sql
alter table public.control_plane_<tabela> enable row level security;
create policy platform_admin_only_control_plane_<tabela> on public.control_plane_<tabela>
  for all
  using (public.fn_is_platform_admin())
  with check (public.fn_is_platform_admin());
```

`fn_is_platform_admin()` é **reusada**, nenhum helper novo criado — mesma
função `SECURITY DEFINER STABLE` que já protege `incidents`, `organizations`
(write), `platform_admins`. Definição (`supabase/baseline.sql`):

```sql
create or replace function public.fn_is_platform_admin() returns boolean
  language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = auth.uid() and revoked_at is null
  );
$$;
```

## Exceção: `control_plane_operation_events`

Append-only como `api_audit_log` — duas policies em vez de `FOR ALL`, e
**nenhuma** de UPDATE/DELETE (negado por padrão com RLS ligada):

```sql
create policy control_plane_operation_events_select on public.control_plane_operation_events
  for select using (public.fn_is_platform_admin());

create policy control_plane_operation_events_insert on public.control_plane_operation_events
  for insert with check (public.fn_is_platform_admin());
```

## Nunca `USING (true)`

Confirmado por auditoria do `baseline.sql`: `USING (true)` existe em só 2
lugares no repo inteiro, ambos catálogo GLOBAL de leitura pública
intencional (`ai_models_read_all`, `ai_pricing_public_read`) — nunca em
tabela com dado sensível. Nenhuma das 8 tabelas desta fase usa.

## Quem tem acesso

| Papel | Acesso |
|---|---|
| Platform-admin (`platform_admins`, `revoked_at is null`) | Total — todas as 8 tabelas, todas as operações permitidas por policy |
| Admin de tenant (role `admin` dentro de uma `organization_id` qualquer) | **Nenhum** |
| Vendedor/agente/viewer | **Nenhum** |
| Usuário final (cliente do CRM) | **Nenhum** |
| Service role (backend) | Bypassa RLS por natureza — repositories filtram manualmente, mas não por `organization_id` (a tabela não é tenant-aware); a responsabilidade de só chamar em contexto platform-admin é de quem invoca (`requirePlatformAdmin()` na UI) |

## "Tenant admin nunca enxerga outro tenant" — como isso é garantido aqui

Trivialmente: **nenhum tenant admin enxerga NADA aqui**, então não há como
enxergar "outro" tenant — não existe caminho de RLS que dê acesso a um
usuário só por ele ser `admin` dentro de uma `organization_id`. Isso é
deliberado: não há hoje nenhuma coluna que ligue uma
`control_plane_installations`/`control_plane_tenants` a uma
`organizations.id` desta CRM (são conceitos de nível diferente — ver
`docs/architecture/brighter-platform.md` §"Regras de instalação"). Se uma
fase futura quiser dar a um cliente visão da SUA PRÓPRIA linha na Control
Plane, isso precisa de uma coluna nova (`linked_organization_id uuid
references organizations(id)`) e uma policy adicional escopada por
`fn_user_org_ids()` — não existe hoje, e não deveria ser adicionada sem essa
migration explícita.

## Como testar (não executado nesta sessão — proibido tocar banco real)

`pnpm test:db` sobe Postgres efêmero, aplica `baseline.sql` e roda os
invariantes, incluindo isolamento RLS. Um teste de isolamento pra esta fase
deveria provar:

1. Usuário sem linha em `platform_admins` → `SELECT`/`INSERT`/`UPDATE` em
   qualquer `control_plane_*` retorna 0 linhas / é negado.
2. Usuário com linha em `platform_admins` (`revoked_at is null`) → leitura e
   escrita completas nas 7 tabelas `FOR ALL`.
3. `control_plane_operation_events`: platform-admin consegue SELECT+INSERT,
   mas UPDATE/DELETE são negados mesmo pra platform-admin (sem policy pra
   esses comandos).
4. `platform_admins.revoked_at` setado → acesso revogado imediatamente (a
   função é `STABLE`, não `IMMUTABLE` — reavalia por statement).
