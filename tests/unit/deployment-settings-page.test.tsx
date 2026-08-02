/**
 * Prova de renderização do Server Component `/app/settings/deployment`, sem
 * banco, sem auth real e sem servidor: mocka autenticação, organização ativa,
 * branding e Module Engine, e chama a página (função async) diretamente —
 * mesmo padrão de isolar a peça sob teste usado em `modules-sidebar.test.tsx`.
 *
 * Este arquivo prova que a página MONTA sem erro para os três cenários da
 * prova visual (Dedicated saudável, Lite mínimo, cenário com warning). A
 * fidelidade pixel-a-pixel (layout real, responsividade) é responsabilidade
 * do passo de screenshot via Playwright sobre o HTML estático gerado a
 * partir do mesmo JSX — ver `scripts/qa/render-deployment-scenarios.tsx`.
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
vi.mock("@/lib/modules/runtime", () => ({
  getDeploymentPlan: vi.fn(),
  getEnabledModules: vi.fn(),
}));
vi.mock("@/lib/branding", () => ({
  branding: vi.fn(),
}));
// `page.tsx` também lê `env.NEXT_PUBLIC_APP_URL` diretamente (fora do Module
// Engine) para derivar domínio/slug de exibição — mocado para isolar o teste
// de qualquer `.env` real do host, nunca para simular segredo.
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://crm.empresa-exemplo.invalid" },
}));

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { getDeploymentPlan, getEnabledModules } from "@/lib/modules/runtime";
import { branding } from "@/lib/branding";
import DeploymentSettingsPage from "@/app/app/settings/deployment/page";

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

const DEFAULT_BRANDING = {
  name: "Empresa Exemplo",
  logoUrl: null,
  initial: "E",
  supportEmail: "suporte@empresa-exemplo.invalid",
  legalName: "Empresa Exemplo LTDA",
  websiteUrl: null,
  fromName: "Empresa Exemplo",
  fromEmail: null,
  faviconUrl: null,
};

function mockModules(ids: string[]) {
  vi.mocked(getEnabledModules).mockReturnValue(ids.map((id) => ({ id }) as never));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(ADMIN_USER as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue(ACTIVE_ORG_ADMIN as never);
  vi.mocked(branding).mockReturnValue(DEFAULT_BRANDING as never);
});

describe("DeploymentSettingsPage", () => {
  it("cenário Dedicated: monta sem erro e não mostra valor de segredo", async () => {
    vi.mocked(getDeploymentPlan).mockReturnValue("dedicated");
    mockModules(["core.contacts", "core.pipeline", "channel.whatsapp", "ai.agents"]);

    const jsx = await DeploymentSettingsPage();
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Implantação");
    expect(html).toContain("Dedicated");
    expect(html).toContain("VPS obrigatória");
    expect(html).toContain("channel.whatsapp");
    // só nomes de env var, nunca valor — nenhuma destas strings de segredo real deveria aparecer
    expect(html).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY=\S/);
    expect(html).not.toContain("test-placeholder-service-role-key");
  });

  it("cenário Lite: monta sem erro, sem VPS/Docker/proxy", async () => {
    vi.mocked(getDeploymentPlan).mockReturnValue("lite");
    mockModules(["core.contacts", "core.pipeline"]);

    const jsx = await DeploymentSettingsPage();
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Lite");
    expect(html).toContain("VPS não obrigatória");
    expect(html).toContain("Docker não usado");
  });

  it("cenário com warning: agente não-admin é redirecionado (403), nunca vê o manifesto", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(AGENT_ORG as never);
    vi.mocked(getDeploymentPlan).mockReturnValue("dedicated");
    mockModules(["core.contacts"]);

    await expect(DeploymentSettingsPage()).rejects.toThrow(/redirect/i);
  });
});
