/** Blueprint fake — determinístico e configurável via `request.input`, nunca I/O real. */
import { createProvisioningProviderAdapter } from "./base";

export const FakeProvisioningProviderAdapter = createProvisioningProviderAdapter({
  providerId: "fake",
  buildOutput: (request) => ({
    message: `preview sintético de "${request.operation}"`,
    echo: request.input,
  }),
  buildRollbackSteps: (request) => [`reverter simulação fake de "${request.operation}"`],
});
