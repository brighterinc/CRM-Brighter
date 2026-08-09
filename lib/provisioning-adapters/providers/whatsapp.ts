/** Blueprint WhatsApp (canal genérico) — declara capabilities/rollback teórico, nunca conecta número real. */
import { createTableDrivenProvisioningProviderAdapter } from "./base";

export const WhatsappProvisioningProviderAdapter = createTableDrivenProvisioningProviderAdapter("whatsapp", {
  "channel.plan": {
    message: "Planejaria a conexão do número de WhatsApp do cliente.",
    rollback: ["desconectar número de WhatsApp"],
  },
  "inbox.plan": {
    message: "Planejaria a caixa de entrada vinculada ao canal WhatsApp.",
    rollback: ["remover caixa de entrada planejada"],
  },
});
