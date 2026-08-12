/**
 * Mesmo padrão de `tests/unit/provisioning-adapters-page.test.tsx`: mocka o
 * guard de auth e as fontes de dado, chama a página (Server Component
 * async) diretamente e renderiza com `renderToStaticMarkup` — sem banco,
 * sem servidor, sem Next.js real.
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
import ControlPlanePersistencePage from "@/app/app/settings/control-plane/persistence/page";

function emptyRepos() {
  return {
    mode: "database" as const,
    tenants: { list: vi.fn().mockResolvedValue([]) },
    installations: { list: vi.fn().mockResolvedValue([]) },
    deployments: { listByInstallation: vi.fn().mockResolvedValue([]) },
    provisioning: { listRunsByInstallation: vi.fn().mockResolvedValue([]) },
    providerConnections: { listByInstallation: vi.fn().mockResolvedValue([]) },
    vault: {},
    secretReferences: { listByInstallation: vi.fn().mockResolvedValue([]) },
    operationEvents: { listRecent: vi.fn().mockResolvedValue([]) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: "admin-1" } as never,
    platformAdmin: { user_id: "admin-1", scope: "full", mfa_required: true },
  });
});

describe("ControlPlanePersistencePage", () => {
  it("banco vazio: renderiza sem erro, mostra estado vazio explícito em cada seção", async () => {
    vi.mocked(createControlPlaneRepositories).mockResolvedValue(emptyRepos() as never);

    const jsx = await ControlPlanePersistencePage();
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Control Plane");
    expect(html).toContain("Nenhum tenant persistido ainda");
    expect(html).toContain("Nenhuma installation persistida ainda");
    expect(html).toContain("Nenhuma referência de segredo registrada ainda");
  });

  it("nunca mostra vault_key nem qualquer chave sensível no HTML renderizado", async () => {
    const repos = emptyRepos();
    repos.installations.list = vi.fn().mockResolvedValue([
      {
        id: "inst-1",
        slug: "empresa-teste",
        company: "Empresa Teste",
        status: "active",
        commercial: "production",
        technical: "running",
      },
    ]);
    repos.secretReferences.listByInstallation = vi.fn().mockResolvedValue([
      {
        id: "sr-1",
        reference: "ref-1",
        type: "api_key",
        provider: "supabase",
        vaultProvider: "in_memory",
        vaultKey: "placeholder/segredo-nunca-deveria-aparecer",
        version: 1,
        status: "active",
        installationId: "inst-1",
        tenantId: null,
        createdAt: "now",
        updatedAt: "now",
      },
    ]);
    vi.mocked(createControlPlaneRepositories).mockResolvedValue(repos as never);

    const jsx = await ControlPlanePersistencePage();
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Empresa Teste");
    expect(html).toContain("ref-1");
    expect(html).not.toContain("placeholder/segredo-nunca-deveria-aparecer");
    // A tela mostra a palavra "vault_key" só na legenda explicativa ("nunca é
    // lido nem exibido nesta tela") — isso é intencional. O que não pode
    // vazar é o VALOR do campo, já coberto pela asserção acima.
  });

  it("nunca renderiza a tela quando requirePlatformAdmin rejeita (redirect propagado, não engolido)", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(new Error("redirect() chamado"));
    vi.mocked(createControlPlaneRepositories).mockResolvedValue(emptyRepos() as never);

    await expect(ControlPlanePersistencePage()).rejects.toThrow(/redirect/i);
    expect(createControlPlaneRepositories).not.toHaveBeenCalled();
  });
});
