/**
 * Chamadas tipadas à Supabase Management API — construídas sobre
 * `SupabaseManagementClient` (`supabase-client.ts`). Cada função corresponde
 * a uma operação `real_supported` do catálogo (`supabase-real-operations.ts`).
 * Nenhuma função aqui decide retry/gate/credencial — isso é
 * responsabilidade de `supabase-real.ts`/`supabase-real-retry.ts`.
 */
import type { SupabaseManagementClient } from "./supabase-client";

export type SupabaseApiProject = {
  id: string;
  name?: string;
  region?: string;
  status?: string;
  organization_id?: string;
  created_at?: string;
};

export async function listProjects(
  client: SupabaseManagementClient,
  token: string,
  correlationId: string,
): Promise<SupabaseApiProject[]> {
  const { json } = await client.request<SupabaseApiProject[]>("/v1/projects", { method: "GET", token, correlationId });
  return Array.isArray(json) ? json : [];
}

export async function getProject(
  client: SupabaseManagementClient,
  token: string,
  projectRef: string,
  correlationId: string,
): Promise<SupabaseApiProject> {
  const { json } = await client.request<SupabaseApiProject>(`/v1/projects/${encodeURIComponent(projectRef)}`, {
    method: "GET",
    token,
    correlationId,
    errorExtra: { projectRef },
  });
  return json;
}
