/**
 * Blueprint Evolution API — declara capabilities/rollback teórico, nunca
 * chama a API Evolution. Sem etapa própria no catálogo do Provisioning
 * Engine hoje — registrado como blueprint alcançável direto via
 * registry/CLI, nunca mapeado a uma etapa que não existe.
 */
import { createTableDrivenProvisioningProviderAdapter } from "./base";

export const EvolutionProvisioningProviderAdapter = createTableDrivenProvisioningProviderAdapter("evolution", {
  "instance.plan": {
    message: "Planejaria a instância Evolution API.",
    rollback: ["remover instância Evolution planejada"],
  },
  "webhook.plan": {
    message: "Planejaria o webhook de eventos da instância Evolution.",
    rollback: ["remover webhook Evolution planejado"],
  },
});
