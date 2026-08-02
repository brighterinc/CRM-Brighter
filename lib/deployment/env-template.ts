/**
 * Renderiza um `.env` de EXEMPLO a partir de um `DeploymentManifest` — só
 * placeholders e valores já públicos (branding, plano, módulos). Nunca grava
 * em disco e nunca inclui valor de segredo; variáveis obrigatórias sem valor
 * público viram `<CONFIGURAR>`.
 */
import type { DeploymentManifest } from "./types";

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

export function renderEnvTemplate(manifest: DeploymentManifest): string {
  const lines: string[] = [
    `# .env de exemplo — ${manifest.client.name} (${manifest.client.slug})`,
    "# Gerado pelo Brighter Deployment Engine. Nenhum valor de segredo real está aqui.",
    "# Troque <CONFIGURAR> pelos valores reais antes de instalar.",
    "",
  ];

  const publicValues = manifest.environment.generatedPublicValues;
  const publicKeys = Object.keys(publicValues).sort();
  for (const key of publicKeys) {
    lines.push(`${key}=${quoteIfNeeded(publicValues[key]!)}`);
  }
  lines.push("");

  const remainingRequired = manifest.environment.required.filter((name) => !(name in publicValues));
  if (remainingRequired.length > 0) {
    lines.push("# Obrigatórias — preencher antes de instalar");
    for (const name of remainingRequired) {
      lines.push(`${name}=<CONFIGURAR>`);
    }
    lines.push("");
  }

  const remainingOptional = manifest.environment.optional.filter((name) => !(name in publicValues));
  if (remainingOptional.length > 0) {
    lines.push("# Opcionais — deixe em branco se não for usar");
    for (const name of remainingOptional) {
      lines.push(`${name}=`);
    }
  }

  return lines.join("\n") + "\n";
}
