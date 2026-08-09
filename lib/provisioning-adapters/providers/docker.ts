/** Blueprint Docker — declara capabilities/rollback teórico, nunca executa `docker`/`docker compose`. */
import { createTableDrivenProvisioningProviderAdapter } from "./base";

export const DockerProvisioningProviderAdapter = createTableDrivenProvisioningProviderAdapter("docker", {
  "compose.validate": {
    message: "Validaria o arquivo `docker-compose` e a instalação do runtime.",
    rollback: ["desinstalar runtime da VPS"],
  },
  "container.plan": {
    message: "Planejaria os containers exigidos pela instalação.",
    rollback: ["remover containers planejados"],
  },
  "network.plan": {
    message: "Planejaria a rede Docker interna da instalação.",
    rollback: ["remover rede Docker planejada"],
  },
  "volume.plan": {
    message: "Planejaria volumes persistentes da instalação.",
    rollback: ["remover volumes planejados"],
  },
});
