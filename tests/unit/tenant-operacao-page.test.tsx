/**
 * Mesmo padrão de `tests/unit/deployment-settings-page.test.tsx`: mocka
 * autenticação, organização ativa, branding e Module Engine, e chama a
 * página (Server Component async) diretamente com `renderToStaticMarkup` —
 * sem banco, sem servidor, sem Next.js real.
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
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://crm.empresa-exemplo.invalid",
    NEXT_PUBLIC_SUPABASE_URL: "https://abcxyz.supabase.co",
  },
}));

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { getDeploymentPlan, getEnabledModules } from "@/lib/modules/runtime";
import { branding } from "@/lib/branding";
import OperacaoSettingsPage from "@/app/app/settings/operacao/page";

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

describe("OperacaoSettingsPage", () => {
  it("cenário admin: monta sem erro, mostra prontidão e nunca segredo", async () => {
    vi.mocked(getDeploymentPlan).mockReturnValue("dedicated");
    mockModules(["core.contacts", "core.pipeline", "channel.whatsapp"]);

    const jsx = await OperacaoSettingsPage();
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Operação");
    expect(html).toContain("Empresa Exemplo");
    expect(html).toContain("Prontidão");
    expect(html).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY=\S/);
    expect(html).not.toContain("test-placeholder-service-role-key");
    expect(html).not.toMatch(/serviceRoleKey/i);
  });

  it("cenário Lite: monta sem erro", async () => {
    vi.mocked(getDeploymentPlan).mockReturnValue("lite");
    mockModules(["core.contacts", "core.pipeline"]);

    const jsx = await OperacaoSettingsPage();
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Lite");
  });

  it("agente não-admin é redirecionado (403), nunca vê o painel", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(AGENT_ORG as never);
    vi.mocked(getDeploymentPlan).mockReturnValue("dedicated");
    mockModules(["core.contacts"]);

    await expect(OperacaoSettingsPage()).rejects.toThrow(/redirect/i);
  });
});
