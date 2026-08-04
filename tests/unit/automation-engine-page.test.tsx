/**
 * Mesmo padrão de `tests/unit/monitoring-page.test.tsx`: mocka
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
import AutomacaoSettingsPage from "@/app/app/settings/automacao/page";

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

describe("AutomacaoSettingsPage", () => {
  it("cenário com automation.webhooks: monta sem erro, mostra o workflow de demonstração concluído", async () => {
    vi.mocked(getDeploymentPlan).mockReturnValue("dedicated");
    mockModules(["core.contacts", "core.pipeline", "channel.whatsapp", "automation.webhooks"]);

    const jsx = await AutomacaoSettingsPage();
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Automação");
    expect(html).toContain("Boas-vindas a novo lead");
    expect(html).toContain("Concluído");
    expect(html).toContain("Simulação disponível via CLI");
    expect(html).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY=\S/);
    expect(html).not.toMatch(/serviceRoleKey/i);
  });

  // NOTA: não existe cenário de teste "sem automation.webhooks" pra esta
  // página. `getCurrentInstallationTenant()` (`lib/tenants/current-installation.ts`)
  // repassa `getEnabledModules().map(m => m.id)` como `requestedModules` pra
  // `generateDeploymentManifest`, mas NUNCA `disabledModules` — e como
  // `automation.webhooks` nasce `defaultEnabled: true`
  // (`lib/modules/catalog.ts`), o manifesto sempre o reinclui
  // independentemente do que `getEnabledModules()` (mockado aqui) devolve.
  // Achado pré-existente, comum às 7 fundações anteriores que também usam
  // `getCurrentInstallationTenant()` (não introduzido nesta feature, fora do
  // escopo desta sessão consertar) — reportado ao usuário separadamente. O
  // estado "Nenhum workflow configurado" da página É coberto — via
  // `renderAutomationSummaryMarkdown`/`generateAutomationSummary` com lista
  // vazia em `automation-engine-summary.test.ts`, e a expressão JSX que
  // consome esse mesmo `summary.workflows.length === 0` é trivial o
  // suficiente (ternário direto) pra não precisar de uma segunda prova via
  // Server Component.

  it("agente não-admin é redirecionado (403), nunca vê o painel", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(AGENT_ORG as never);
    vi.mocked(getDeploymentPlan).mockReturnValue("dedicated");
    mockModules(["core.contacts"]);

    await expect(AutomacaoSettingsPage()).rejects.toThrow(/redirect/i);
  });

  it("sem organização ativa redireciona para /app", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(null as never);
    vi.mocked(getDeploymentPlan).mockReturnValue("dedicated");
    mockModules(["core.contacts"]);

    await expect(AutomacaoSettingsPage()).rejects.toThrow(/redirect/i);
  });
});
