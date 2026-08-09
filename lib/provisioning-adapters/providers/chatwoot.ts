/**
 * Blueprint Chatwoot — declara capabilities/rollback teórico, nunca chama a
 * API do Chatwoot. Sem etapa própria no catálogo do Provisioning Engine
 * hoje (só `configure_whatsapp`, genérico) — registrado como blueprint
 * alcançável direto via registry/CLI, nunca mapeado a uma etapa que não existe.
 */
import { createTableDrivenProvisioningProviderAdapter } from "./base";

export const ChatwootProvisioningProviderAdapter = createTableDrivenProvisioningProviderAdapter("chatwoot", {
  "account.plan": {
    message: "Planejaria a conta Chatwoot desta instalação.",
    rollback: ["remover conta Chatwoot planejada"],
  },
  "inbox.plan": {
    message: "Planejaria a inbox Chatwoot vinculada ao canal.",
    rollback: ["remover inbox Chatwoot planejada"],
  },
});
