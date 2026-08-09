/** Blueprint no-op — nunca finge sucesso "de verdade", só documenta que nada foi executado. */
import { createProvisioningProviderAdapter } from "./base";

export const NoopProvisioningProviderAdapter = createProvisioningProviderAdapter({
  providerId: "noop",
  buildOutput: (request) => ({
    message: `no-op — nenhuma ação real executada para "${request.operation}"`,
  }),
  buildRollbackSteps: () => ["no-op — nada a reverter"],
});
