/**
 * CLI de exemplo da Brighter Control Plane — Foundation v1.
 *
 * NÃO persiste, NÃO provisiona, NÃO faz deploy, NÃO acessa Supabase/VPS/DNS
 * reais. Monta o catálogo de demonstração (`createDemoInstallations()` —
 * mesmo padrão de `scripts/generate-tenant-summary.ts` e
 * `scripts/generate-provisioning-plan.ts`) e imprime o resumo agregado
 * (`generateControlPlaneSummary`) em Markdown ou JSON.
 *
 * Uso:
 *   pnpm control:summary                 # Markdown (default)
 *   pnpm control:summary -- --format json
 */
import { createDemoInstallations, generateControlPlaneSummary, renderControlPlaneSummaryMarkdown } from "../lib/control-plane";

function parseFormat(argv: string[]): "json" | "markdown" {
  const index = argv.indexOf("--format");
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value === "json" ? "json" : "markdown";
}

function main(): void {
  const format = parseFormat(process.argv.slice(2));
  const installations = createDemoInstallations();
  const summary = generateControlPlaneSummary(installations);

  if (format === "json") {
    console.log(JSON.stringify({ summary, installations }, null, 2));
    return;
  }

  console.log(renderControlPlaneSummaryMarkdown(summary));
}

main();
