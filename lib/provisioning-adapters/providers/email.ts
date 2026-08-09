/** Blueprint Email — declara capabilities/rollback teórico, nunca configura provedor real. */
import { createTableDrivenProvisioningProviderAdapter } from "./base";

export const EmailProvisioningProviderAdapter = createTableDrivenProvisioningProviderAdapter("email", {
  "provider.configure": {
    message: "Configuraria o provedor de e-mail transacional.",
    rollback: ["desativar provedor de e-mail"],
  },
  "sender.verify": {
    message: "Verificaria o domínio/remetente de e-mail transacional.",
    rollback: [],
  },
});
