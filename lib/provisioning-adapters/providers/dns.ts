/** Blueprint DNS — declara capabilities/rollback teórico, nunca consulta ou altera DNS real. */
import { createTableDrivenProvisioningProviderAdapter } from "./base";

export const DnsProvisioningProviderAdapter = createTableDrivenProvisioningProviderAdapter("dns", {
  "record.plan": {
    message: "Planejaria o apontamento do domínio do cliente para o target de implantação.",
    rollback: ["remover configuração de domínio"],
  },
  "domain.validate": {
    message: "Validaria a propriedade e propagação do domínio do cliente.",
    rollback: [],
  },
  "cname.plan": {
    message: "Planejaria registro CNAME.",
    rollback: ["remover registro CNAME planejado"],
  },
  "txt.plan": {
    message: "Planejaria registro TXT (verificação/SPF).",
    rollback: ["remover registro TXT planejado"],
  },
});
