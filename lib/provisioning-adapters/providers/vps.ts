/** Blueprint VPS — declara capabilities/rollback teórico, nunca acessa porta/serviço/servidor real. */
import { createTableDrivenProvisioningProviderAdapter } from "./base";

export const VpsProvisioningProviderAdapter = createTableDrivenProvisioningProviderAdapter("vps", {
  "server.validate": {
    message: "Validaria/reservaria a VPS dedicada desta instalação.",
    // Decisão deliberada — mesmo espírito de `prepare_vps.supportsRollback: false`
    // em `lib/provisioning/catalog.ts`: recurso caro/compartilhado, nunca
    // sugerir remoção automática.
    rollback: [],
  },
  "filesystem.prepare": {
    message: "Prepararia estrutura de diretórios e permissões na VPS.",
    rollback: ["remover diretórios criados por esta execução"],
  },
  "service.plan": {
    message: "Planejaria serviços de sistema (worker, scheduler, backup, monitoramento) na VPS.",
    rollback: ["desativar serviço planejado nesta execução"],
  },
});
