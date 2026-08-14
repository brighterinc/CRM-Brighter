/**
 * Mesmo padrão de `tests/unit/provider-credentials-runtime-page.test.tsx`:
 * mocka o guard de auth e a fábrica de repositories, chama a página (Server
 * Component async) diretamente e renderiza com `renderToStaticMarkup` — sem
 * banco, sem servidor, sem Next.js real. Migration `0098` ainda não aplicada
 * a nenhum banco (`mode: "database"` não testável via Playwright nesta
 * sessão) — mesma razão documentada em `docs/testing/user-journey-map.md`
 * pra J17/J18.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/requirePlatformAdmin", () => ({
  requirePlatformAdmin: vi.fn(),
}));
vi.mock("@/lib/control-plane-persistence/repositories/factory", () => ({
  createControlPlaneRepositories: vi.fn(),
}));

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";
import SupabaseProviderPage from "@/app/app/settings/control-plane/providers/supabase/page";

function emptyRepos() {
  return {
    mode: "database" as const,
    installations: { list: vi.fn().mockResolvedValue([]) },
    providerConnections: { listByInstallation: vi.fn().mockResolvedValue([]) },
    secretReferences: { listByInstallation: vi.fn().mockResolvedValue([]) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: "admin-1" } as never,
    platformAdmin: { user_id: "admin-1", scope: "full", mfa_required: true },
  });
});

describe("SupabaseProviderPage", () => {
  it("banco vazio: renderiza sem erro, mostra as 8 operações e o gate desligado (default)", async () => {
    vi.mocked(createControlPlaneRepositories).mockResolvedValue(emptyRepos() as never);

    const jsx = await SupabaseProviderPage();
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Provider — Supabase");
    expect(html).toContain("project.validate");
    expect(html).toContain("project.create");
    expect(html).toContain("edge_functions.prepare");
    expect(html).toContain("desligado (default)");
    expect(html).toContain("Nenhuma instalação persistida ainda");
  });

  it("mostra 'ligado' quando REAL_PROVISIONING_ENABLED=true", async () => {
    vi.stubEnv("REAL_PROVISIONING_ENABLED", "true");
    vi.mocked(createControlPlaneRepositories).mockResolvedValue(emptyRepos() as never);

    const jsx = await SupabaseProviderPage();
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("ligado");
  });

  it("nunca mostra vault_key nem qualquer valor de segredo no HTML renderizado", async () => {
    const repos = emptyRepos();
    repos.installations.list = vi.fn().mockResolvedValue([{ id: "inst-1", slug: "empresa-teste", company: "Empresa Teste", status: "active" }]);
    repos.providerConnections.listByInstallation = vi.fn().mockResolvedValue([
      {
        id: "conn-1",
        installationId: "inst-1",
        provider: "supabase",
        mode: "dry_run",
        status: "available",
        config: {},
        secretReferenceId: "sr-1",
        createdAt: "now",
        updatedAt: "now",
      },
    ]);
    repos.secretReferences.listByInstallation = vi.fn().mockResolvedValue([
      {
        id: "sr-1",
        installationId: "inst-1",
        tenantId: null,
        reference: "ref-1",
        type: "api_key",
        provider: "supabase",
        vaultProvider: "in_memory",
        vaultKey: "segredo-nunca-deveria-aparecer",
        version: 1,
        status: "active",
        createdAt: "now",
        updatedAt: "now",
      },
    ]);
    vi.mocked(createControlPlaneRepositories).mockResolvedValue(repos as never);

    const jsx = await SupabaseProviderPage();
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Empresa Teste");
    expect(html).not.toContain("segredo-nunca-deveria-aparecer");
  });

  it("nunca renderiza a tela quando requirePlatformAdmin rejeita (redirect propagado, não engolido)", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(new Error("redirect() chamado"));
    vi.mocked(createControlPlaneRepositories).mockResolvedValue(emptyRepos() as never);

    await expect(SupabaseProviderPage()).rejects.toThrow(/redirect/i);
    expect(createControlPlaneRepositories).not.toHaveBeenCalled();
  });
});
