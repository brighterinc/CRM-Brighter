---
type: architecture
status: v1
last_updated: 2026-08-13
---

# Runtime execution boundary — o que existe agora × o que é fase futura

## `withProviderCredential()` — o único ponto de entrada

`lib/provider-credentials-runtime/runtime.ts`. Nenhum código deve resolver
uma credencial fora desta função — ela é o chokepoint único (mesmo espírito
de `allowlistedFetch()` em `lib/agent-engine/edge/egress.ts` ser o
chokepoint único de egress de rede: um ponto estreito, fail-closed, que todo
tráfego precisa atravessar).

```
withProviderCredential(deps, request, callback)
  1. valida forma do request
  2. policy (default deny)
  3. cria + ativa lease
  4. resolve valor
  5. entrega ResolvedCredential ao callback
  6. callback executa a operação — NESTA FASE, sempre fake/noop
  7. detecta tentativa de escape no retorno
  8. consome + libera lease em finally
  9. audita cada etapa (sanitizado)
  10. NUNCA retorna a credencial — só o resultado do callback
```

## Nunca acessado nesta fase

- Lumina (porta 8000) — proibido pela tarefa, nunca tocado.
- Docker, systemctl, reboot, Caddy, DNS.
- Qualquer API externa real: Supabase, Vercel, Cloudflare, Hostinger,
  Evolution, WAHA, Chatwoot, SMTP, gateway de pagamento.
- Rede de qualquer tipo — os 3 vault providers desta fase (`vault-providers.md`)
  são todos locais (Map em memória ou `process.env`).
- Banco real — nenhuma migration foi aplicada; `CredentialLeaseRepository`
  só tem implementação in-memory.

## O que MUDA quando o vault real existir

Quando o backend `pgp_sym_encrypt`/`pgp_sym_decrypt` planejado em
`docs/control-plane-persistence/runtime-boundary.md` for implementado:

1. Um novo `RuntimeVaultProvider` (`id: "postgres_pgcrypto"` ou similar)
   entra no registry — os 3 providers desta fase continuam existindo
   (Noop/InMemory seguem úteis pra teste; Environment pode virar caminho
   real de bootstrap se decidido).
2. `resolveSecret()` do novo provider chama uma função `SECURITY DEFINER`
   nova (nunca `fn_encrypt_oauth`/`fn_decrypt_oauth`, que são escopadas ao
   Nuvemshop) contra uma tabela de ciphertext SEPARADA (nunca em
   `control_plane_secret_references`, que é metadata pública por desenho).
3. `withProviderCredential`, `policy.ts`, `lease.ts` não mudam — o boundary
   já está pronto pra receber um provider real sem alteração de contrato.

## O que MUDA quando um Provisioning Adapter real existir

`ProvisioningProviderAdapter.executeReal()` (`lib/provisioning-adapters/`)
hoje sempre lança `RealProvisioningDisabledError`. Quando um adapter real
existir (ROADMAP: "Real Supabase Adapter" em diante):

1. O executor real vai precisar de um novo campo em
   `ProvisioningAdapterRequest` (ou um wrapper) carregando um
   `ResolvedCredential`/handle de lease de curta duração — hoje
   `ProvisioningAdapterRequest.input` é só config sanitizada, sem campo de
   credencial.
2. Esse campo precisa ficar FORA de `sanitizeAdapterRequestForLog` por
   inteiro (não redigido por nome de chave — nunca incluído como campo),
   consistente com a doutrina de `CredentialsVault`: "se não pode ser lido,
   não tem como vazar".
3. O adapter real chamaria `withProviderCredential` internamente (ou seria
   chamado DE DENTRO de um callback de `withProviderCredential`) — o
   boundary desta fase já é a forma certa, só falta um adapter real pra
   usá-lo de verdade.

## Pendências cross-cutting (herdadas do ROADMAP, ainda sem dono)

- **Auditoria de execução real** — hoje só eventos de resolução/lease
  existem; nenhuma execução de infra real acontece ainda pra auditar.
- **Rollback real** — hoje só preview textual (`ProvisioningRollbackPreview`).
- **Gate de aprovação humana antes de ação destrutiva real** — nenhuma ação
  destrutiva real existe ainda pra aprovar. Resolver um valor de segredo
  real pra um provider real será provavelmente a primeira ação "sensível"
  de verdade do sistema — um step-up de aprovação (mirroring o AAL2 já
  existente em `requirePlatformAdmin`) pode precisar entrar especificamente
  na frente da resolução de segredo, não só do acesso à página admin.
