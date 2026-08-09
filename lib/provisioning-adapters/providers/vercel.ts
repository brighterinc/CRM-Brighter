/** Blueprint Vercel — declara capabilities/rollback teórico, nunca chama a API da Vercel. */
import { createTableDrivenProvisioningProviderAdapter } from "./base";

export const VercelProvisioningProviderAdapter = createTableDrivenProvisioningProviderAdapter("vercel", {
  "project.create": {
    message: "Criaria o projeto de frontend hospedado na Vercel.",
    rollback: ["remover projeto de frontend"],
  },
  "env.configure": {
    message: "Aplicaria as variáveis de ambiente do projeto de frontend.",
    rollback: ["limpar variáveis de ambiente do frontend"],
  },
  "deployment.prepare": {
    message: "Prepararia o build do frontend para publicação.",
    rollback: ["remover deploy de frontend"],
  },
  "domain.attach": {
    message: "Anexaria o domínio do cliente ao projeto de frontend (SSL emitido automaticamente).",
    rollback: ["remover configuração de domínio"],
  },
});
