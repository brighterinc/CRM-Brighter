/**
 * Blueprint WAHA — declara capabilities/rollback teórico, nunca sobe uma
 * sessão WAHA real. Sem etapa própria no catálogo do Provisioning Engine
 * hoje — registrado como blueprint alcançável direto via registry/CLI,
 * nunca mapeado a uma etapa que não existe.
 */
import { createTableDrivenProvisioningProviderAdapter } from "./base";

export const WahaProvisioningProviderAdapter = createTableDrivenProvisioningProviderAdapter("waha", {
  "session.plan": {
    message: "Planejaria a sessão WAHA (engine NOWEB) desta instalação.",
    rollback: ["remover sessão WAHA planejada"],
  },
});
