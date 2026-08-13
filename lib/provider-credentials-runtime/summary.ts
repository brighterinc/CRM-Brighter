/**
 * `generateProviderCredentialsRuntimeSummary()` — formata (JSON/Markdown) o
 * estado da Provider Credentials Runtime pra CLI/admin UI. Função PURA de
 * formatação — quem chama já reuniu os dados (`registry.healthPreview()`,
 * `buildInstallationCredentialReadiness`, `runAllSimulationScenarios`).
 * NUNCA mostra `value`/`env value`/`vault secret` — só metadata/status.
 */
import type { ProviderCredentialReadiness, ProviderCredentialReadinessOverview } from "./control-plane-integration";
import { assertNoEmbeddedCredential } from "./sanitization";
import type { SimulationScenarioResult } from "./simulation";
import type { RuntimeVaultProviderHealth } from "./types";

export type ProviderCredentialsRuntimeSummaryInput = {
  vaultProviderHealth: RuntimeVaultProviderHealth[];
  readiness: ProviderCredentialReadiness[];
  overview: ProviderCredentialReadinessOverview;
  scenarioResults?: SimulationScenarioResult[];
  activeLeaseCount?: number;
  deniedAccessCount?: number;
};

export type SummaryFormat = "json" | "markdown";

function nextAction(input: ProviderCredentialsRuntimeSummaryInput): string {
  if (input.overview.missing > 0) return `Configurar ${input.overview.missing} conexão(ões)/referência(s) de credencial faltando.`;
  if (input.overview.blocked > 0) return `Investigar ${input.overview.blocked} credencial(is) bloqueada(s)/inativa(s).`;
  if (input.vaultProviderHealth.some((h) => !h.available)) return "Nenhum vault provider real habilitado ainda — fase de fundação.";
  return "Nenhuma ação pendente — todas as credenciais mapeadas estão prontas.";
}

export function generateProviderCredentialsRuntimeSummary(input: ProviderCredentialsRuntimeSummaryInput, format: SummaryFormat): string {
  assertNoEmbeddedCredential(input, "generateProviderCredentialsRuntimeSummary.input");

  if (format === "json") {
    return JSON.stringify(
      {
        vaultProviders: input.vaultProviderHealth,
        readiness: input.readiness,
        overview: input.overview,
        scenarioResults: input.scenarioResults ?? [],
        activeLeaseCount: input.activeLeaseCount ?? 0,
        deniedAccessCount: input.deniedAccessCount ?? 0,
        nextAction: nextAction(input),
      },
      null,
      2,
    );
  }

  const lines: string[] = [
    "# Provider Credentials Runtime — Summary",
    "",
    "## Vault providers",
    "",
    "| Provider | Disponível | Mensagem |",
    "|---|---|---|",
    ...input.vaultProviderHealth.map((h) => `| \`${h.id}\` | ${h.available ? "sim" : "não"} | ${h.message} |`),
    "",
    "## Readiness por instalação/provider",
    "",
    `Total: ${input.overview.total} — prontas: ${input.overview.ready} — faltando: ${input.overview.missing} — bloqueadas: ${input.overview.blocked}`,
    "",
    "| Instalação | Provider | Conexão | Secret ref | Vault | Pronta |",
    "|---|---|---|---|---|---|",
    ...input.readiness.map(
      (r) =>
        `| ${r.installationId.slice(0, 8)}… | ${r.provider} | ${r.connectionStatus} | ${r.secretReferenceStatus} | ${r.vaultProvider ?? "—"} | ${r.ready ? "sim" : "não"} |`,
    ),
    "",
  ];

  if (input.scenarioResults && input.scenarioResults.length > 0) {
    lines.push(
      "## Cenários de simulação",
      "",
      "| Cenário | Resultado | Mensagem |",
      "|---|---|---|",
      ...input.scenarioResults.map((r) => `| \`${r.scenario}\` | ${r.outcome} | ${r.message} |`),
      "",
    );
  }

  lines.push(
    "## Leases ativas / acessos negados",
    "",
    `- Leases ativas (não-terminais): ${input.activeLeaseCount ?? 0}`,
    `- Acessos negados (nesta execução): ${input.deniedAccessCount ?? 0}`,
    "",
    "## Próxima ação",
    "",
    nextAction(input),
  );

  return lines.join("\n");
}
