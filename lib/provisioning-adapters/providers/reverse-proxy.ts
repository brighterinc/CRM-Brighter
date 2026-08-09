/** Blueprint Reverse Proxy — declara capabilities/rollback teórico, nunca altera Caddy real. */
import { createTableDrivenProvisioningProviderAdapter } from "./base";

export const ReverseProxyProvisioningProviderAdapter = createTableDrivenProvisioningProviderAdapter("reverse_proxy", {
  "route.plan": {
    message: "Planejaria rota do proxy reverso (Caddy) para a aplicação.",
    rollback: ["remover configuração de proxy reverso"],
  },
  "tls.plan": {
    message: "Planejaria emissão/renovação do certificado SSL do domínio.",
    rollback: ["revogar certificado SSL"],
  },
});
