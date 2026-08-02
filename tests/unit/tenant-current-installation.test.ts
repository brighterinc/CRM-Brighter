/**
 * Mesmo padrão de mock de `tests/unit/deployment-settings-page.test.tsx`:
 * isola `getCurrentInstallationTenant()` de `@/lib/branding`,
 * `@/lib/modules/runtime` e `@/lib/env` reais — nunca lê `.env` de verdade.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/branding", () => ({ branding: vi.fn() }));
vi.mock("@/lib/modules/runtime", () => ({ getDeploymentPlan: vi.fn(), getEnabledModules: vi.fn() }));
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://crm.empresa-exemplo.invalid",
    NEXT_PUBLIC_SUPABASE_URL: "https://abcxyz.supabase.co",
  },
}));

import { branding } from "@/lib/branding";
import { getDeploymentPlan, getEnabledModules } from "@/lib/modules/runtime";
import {
  deriveInstallDomain,
  deriveInstallSlug,
  getCurrentInstallationTenant,
} from "@/lib/tenants/current-installation";

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(branding).mockReturnValue(DEFAULT_BRANDING as never);
  vi.mocked(getDeploymentPlan).mockReturnValue("dedicated");
  vi.mocked(getEnabledModules).mockReturnValue(
    ["core.contacts", "core.pipeline"].map((id) => ({ id }) as never),
  );
});

describe("deriveInstallSlug / deriveInstallDomain", () => {
  it("deriva slug e domínio de uma URL válida", () => {
    expect(deriveInstallSlug("https://crm.empresa-exemplo.invalid")).toBe("crm-empresa-exemplo-invalid");
    expect(deriveInstallDomain("https://crm.empresa-exemplo.invalid")).toBe("crm.empresa-exemplo.invalid");
  });

  it("cai em fallback pra URL malformada", () => {
    expect(deriveInstallSlug("not a url")).toBe("instalacao");
    expect(deriveInstallDomain("not a url")).toBe("not a url");
  });
});

describe("getCurrentInstallationTenant", () => {
  it("monta um tenant a partir de branding/plano/módulos/env atuais", () => {
    const tenant = getCurrentInstallationTenant();

    expect(tenant.clientName).toBe("Empresa Exemplo");
    expect(tenant.domain).toBe("crm.empresa-exemplo.invalid");
    expect(tenant.plan).toBe("dedicated");
    expect(tenant.requestedModules).toEqual(["core.contacts", "core.pipeline"]);
    expect(tenant.commercialStatus).toBe("active");
    expect(tenant.technicalStatus).toBe("live");
    expect(tenant.manifest).toBeDefined();
    expect(tenant.supabase?.projectUrl).toBe("https://abcxyz.supabase.co");
    expect(tenant.supabase?.projectRef).toBe("abcxyz");
  });

  it("nunca inclui valor de segredo no resultado (só nomes de env var no manifesto, nunca valor)", () => {
    const tenant = getCurrentInstallationTenant();
    const serialized = JSON.stringify(tenant);

    // O manifesto legitimamente LISTA O NOME "SUPABASE_SERVICE_ROLE_KEY" em
    // `environment.required` (contrato do Deployment Engine) — o que nunca
    // pode aparecer é um VALOR de segredo colado nele.
    expect(serialized).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY[":=]+\S*(sk-|postgres:\/\/)/i);
    expect(serialized).not.toContain("test-placeholder-service-role-key");
    expect(serialized).not.toContain("test-placeholder-anon-key");
  });
});
