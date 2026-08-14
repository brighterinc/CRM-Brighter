/**
 * Rollback preview do Real Supabase Adapter — NUNCA executa rollback, só
 * descreve. `project.create` é o único caso com efeito reversível teórico
 * (mesmo não sendo executado nesta etapa — o preview existe pra já deixar
 * documentado o risco antes de qualquer etapa futura implementar o POST de
 * verdade). Demais operações desta etapa são todas leitura — nada a reverter.
 */
import type { SupabaseRealOperation } from "./supabase-real-operations";
import type { SupabaseRealRollbackPreview } from "./supabase-real-types";

export function buildSupabaseRealRollbackPreview(operation: SupabaseRealOperation): SupabaseRealRollbackPreview {
  if (operation === "project.create") {
    return {
      operation,
      reversible: true,
      requiresHumanApproval: true,
      dataLossRisk: true,
      steps: [
        "projeto Supabase criado (Auth + Postgres)",
        "ação reversa: remover o projeto via Management API",
        "exige aprovação humana explícita antes de qualquer remoção",
      ],
      warnings: ["nunca apagar o projeto automaticamente — risco de perda de dados"],
    };
  }

  return {
    operation,
    reversible: false,
    requiresHumanApproval: false,
    dataLossRisk: false,
    steps: [],
    warnings: [`"supabase.${operation}" é somente leitura ou reservada — sem rollback aplicável`],
  };
}
