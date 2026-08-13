/**
 * Mesmo padrão de `tests/unit/control-plane-persistence-page.test.tsx`:
 * mocka o guard de auth e a fábrica de repositories, chama a página (Server
 * Component async) diretamente e renderiza com `renderToStaticMarkup` — sem
 * banco, sem servidor, sem Next.js real.
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
import ProviderCredentialsRuntimePage from "@/app/app/settings/control-plane/credentials-runtime/page";

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
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: "admin-1" } as never,
    platformAdmin: { user_id: "admin-1", scope: "full", mfa_required: true },
  });
});

describe("ProviderCredentialsRuntimePage", () => {
  it("banco vazio: renderiza sem erro, mostra vault providers e estado vazio", async () => {
    vi.mocked(createControlPlaneRepositories).mockResolvedValue(emptyRepos() as never);

    const jsx = await ProviderCredentialsRuntimePage();
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Provider Credentials Runtime");
    expect(html).toContain("noop");
    expect(html).toContain("in_memory");
    expect(html).toContain("environment");
    expect(html).toContain("Nenhuma instalação persistida ainda");
  });

  it("nunca mostra vault_key nem qualquer valor de segredo no HTML renderizado", async () => {
    const repos = emptyRepos();
    repos.installations.list = vi.fn().mockResolvedValue([
      { id: "inst-1", slug: "empresa-teste", company: "Empresa Teste", status: "active" },
    ]);
    repos.providerConnections.listByInstallation = vi.fn().mockResolvedValue([
      {
        id: "conn-1",
        installationId: "inst-1",
        provider: "fake",
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
        provider: "fake",
        vaultProvider: "in_memory",
        vaultKey: "segredo-nunca-deveria-aparecer",
        version: 1,
        status: "active",
        createdAt: "now",
        updatedAt: "now",
      },
    ]);
    vi.mocked(createControlPlaneRepositories).mockResolvedValue(repos as never);

    const jsx = await ProviderCredentialsRuntimePage();
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Empresa Teste");
    expect(html).not.toContain("segredo-nunca-deveria-aparecer");
  });

  it("nunca renderiza a tela quando requirePlatformAdmin rejeita (redirect propagado, não engolido)", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(new Error("redirect() chamado"));
    vi.mocked(createControlPlaneRepositories).mockResolvedValue(emptyRepos() as never);

    await expect(ProviderCredentialsRuntimePage()).rejects.toThrow(/redirect/i);
    expect(createControlPlaneRepositories).not.toHaveBeenCalled();
  });
});
