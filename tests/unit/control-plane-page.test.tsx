/**
 * Mesmo padrão de `tests/unit/provisioning-page.test.tsx`: mocka
 * autenticação e organização ativa, e chama a página (Server Component
 * async) diretamente com `renderToStaticMarkup` — sem banco, sem servidor,
 * sem Next.js real. Diferente da página de provisionamento, esta página não
 * depende de `lib/branding`/`lib/modules/runtime` (usa
 * `createDemoInstallations()`, que só depende do Tenant/Deployment/
 * Provisioning Engine — nenhum deles lê `process.env`).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(),
  resolveActiveOrg: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect() chamado — cenário de teste não deveria disparar redirect");
  }),
}));

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import ControlPlaneSettingsPage from "@/app/app/settings/control-plane/page";

const ADMIN_USER = {
  id: "user-1",
  email: "admin@teste.invalid",
  full_name: "Admin Teste",
  avatar_url: null,
  is_platform_admin: false,
  organizations: [],
};

const ACTIVE_ORG_ADMIN = { orgId: "org-1", name: "Org Teste", role: "admin" as const };
const AGENT_ORG = { orgId: "org-1", name: "Org Teste", role: "agent" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(ADMIN_USER as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue(ACTIVE_ORG_ADMIN as never);
});

describe("ControlPlaneSettingsPage", () => {
  it("cenário admin: monta sem erro, mostra as instalações de demonstração e nunca segredo", async () => {
    const jsx = await ControlPlaneSettingsPage();
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Control Plane");
    expect(html).toContain("Instalações");
    expect(html).toContain("Lite");
    expect(html).toContain("Pro");
    expect(html).toContain("Dedicated");
    expect(html).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY=\S/);
    expect(html).not.toMatch(/serviceRoleKey/i);
  });

  it("mostra o card de estatísticas com o total de instalações", async () => {
    const jsx = await ControlPlaneSettingsPage();
    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Estatísticas");
    expect(html).toContain("Total");
  });

  it("agente não-admin é redirecionado (403), nunca vê o painel", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(AGENT_ORG as never);
    await expect(ControlPlaneSettingsPage()).rejects.toThrow(/redirect/i);
  });

  it("sem organização ativa redireciona para /app", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(null as never);
    await expect(ControlPlaneSettingsPage()).rejects.toThrow(/redirect/i);
  });

  it("plataform admin sem role de org também acessa o painel", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ ...ADMIN_USER, is_platform_admin: true } as never);
    vi.mocked(resolveActiveOrg).mockResolvedValue(AGENT_ORG as never);

    const jsx = await ControlPlaneSettingsPage();
    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Control Plane");
  });
});
