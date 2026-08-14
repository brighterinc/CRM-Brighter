---
type: architecture
status: v1 — não aplicado, nada executado
last_updated: 2026-08-14
---

# Integração conceitual com o Real Supabase Adapter

> `lib/provisioning-adapters/providers/supabase-real*.ts` — NÃO tocado
> nesta fase. Este doc é só o desenho de como as duas peças se encaixariam;
> nenhuma chamada real foi feita, nenhum token real foi usado, nenhum
> projeto Supabase foi criado.

## O gap que o Real Supabase Adapter tinha

Do ROADMAP.md, antes desta fase: "o Real Supabase Adapter ainda resolve
credencial via vault provider de teste/simulação — sem isto,
`REAL_PROVISIONING_ENABLED=true` não tem token de verdade pra usar." O
adapter já chama `withProviderCredential()` corretamente (`supabase-real.ts`
linha ~250) — ele só nunca tinha um `RuntimeVaultProvider` real por trás
capaz de devolver um Management API token de verdade.

## Como ficaria (conceitual — não implementado nesta fase)

1. Platform-admin cria uma `control_plane_secret_references` com
   `provider: "supabase"`, `type: "api_key"`, `vaultProvider:
   "postgres_pgcrypto"` (via `recordSecretReference`).
2. Um fluxo administrativo (fora do escopo desta fase — ver
   "Avaliação: UI de cadastro" abaixo) chama `storeSecretValue(id,
   managementApiToken)` — o token do Supabase Management API entra
   cifrado.
3. `control_plane_provider_connections` liga a installation ao provider
   `"supabase"` com `secretReferenceId` apontando pra essa reference
   (`recordProviderConnection`, já existente).
4. O Real Supabase Adapter continua chamando `withProviderCredential()`
   exatamente como já chama — o `RuntimeVaultProviderRegistry` passado a
   ele precisa ter `PostgresPgcryptoRuntimeVaultProvider` registrado (em
   vez de só `Noop`/`InMemory`/`Environment`).
5. `REAL_PROVISIONING_ENABLED=true` + `REAL_VAULT_BACKEND_ENABLED=true` —
   os DOIS gates precisam estar ligados (camadas independentes, nenhum
   substitui o outro) — só então `project.validate`/`project.read`/
   `project.status` (as 3 operações `REAL_SUPPORTED`) teriam um token de
   verdade pra chamar a Supabase Management API.

## O que NÃO muda no Real Supabase Adapter

Nenhuma linha de `supabase-real*.ts` precisa mudar — ele já depende só da
interface `RuntimeVaultProvider`/`withProviderCredential`, nunca de uma
implementação concreta. Isso é o ponto inteiro de manter o boundary
estável: um backend de vault novo é uma peça que se PLUGA, nunca uma
mudança que se PROPAGA pros consumidores.

## Avaliação: UI de cadastro de credencial

A tarefa pediu pra avaliar se um fluxo de cadastro (write-only) deveria ser
implementado agora. **Decisão desta fase: não implementar UI de cadastro
ainda** — só arquitetura/serviço (`storeSecretValue`/`rotateSecretValue`).
Motivos:

1. A superfície de UI write-only é sensível o suficiente (formulário que
   aceita plaintext, mesmo que nunca o exiba de volta) pra merecer sua
   própria revisão de segurança dedicada — misturar com a fundação do
   backend aumentaria o raio de risco desta sessão sem necessidade.
2. Sem a migration aplicada, não há tabela real pra a UI escrever — uma
   UI "pronta" apontando pra um banco inexistente seria trabalho
   descartável até a aplicação da migration ser decidida.
3. O caminho programático (`storeSecretValue` via CLI/script administrativo
   de operador, nunca por um usuário final) já cobre o caso de uso real
   imediato (configurar o token do Supabase de uma instalação nova) sem
   expor um formulário HTTP.

**Próximo passo recomendado**: depois da migration aplicada e testada,
desenhar a UI write-only como uma sessão PRÓPRIA — formulário que nunca
faz round-trip do valor de volta ao browser (submit único, sem
"mostrar"/"copiar" depois de salvo), com o mesmo rigor de QA Visual da
doutrina do CLAUDE.md.
