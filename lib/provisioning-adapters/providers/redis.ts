/** Blueprint Redis — declara capabilities/rollback teórico, nunca sobe Redis real. */
import { createTableDrivenProvisioningProviderAdapter } from "./base";

export const RedisProvisioningProviderAdapter = createTableDrivenProvisioningProviderAdapter("redis", {
  "instance.plan": {
    message: "Planejaria a instância Redis/serverless-redis-http para rate limit e filas.",
    rollback: ["desativar Redis desta instalação"],
  },
  "connection.validate": {
    message: "Validaria a conectividade planejada com a instância Redis.",
    rollback: [],
  },
});
