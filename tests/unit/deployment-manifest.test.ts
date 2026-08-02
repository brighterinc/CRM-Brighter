import { describe, expect, it } from "vitest";

import { renderEnvTemplate } from "@/lib/deployment/env-template";
import { generateDeploymentManifest } from "@/lib/deployment/manifest";
import type { DeploymentRequest } from "@/lib/deployment/types";

function baseRequest(overrides: Partial<DeploymentRequest> = {}): DeploymentRequest {
  return {
    clientName: "Empresa Exemplo",
    clientSlug: "empresa-exemplo",
    domain: "crm.empresa.com.br",
    plan: "lite",
    requestedModules: [],
    branding: { appName: "Empresa Exemplo" },
    ...overrides,
  };
}

describe("generateDeploymentManifest — geração básica", () => {
  it("gera manifesto válido pra um pedido lite bem formado", () => {
    const manifest = generateDeploymentManifest(
      baseRequest({ requestedModules: ["core.contacts", "core.pipeline"] }),
    );
    expect(manifest.valid).toBe(true);
    expect(manifest.blockers).toEqual([]);
    expect(manifest.plan).toBe("lite");
    expect(manifest.client).toEqual({
      name: "Empresa Exemplo",
      slug: "empresa-exemplo",
      domain: "crm.empresa.com.br",
    });
  });

  it("core.contacts é aceito no plano lite", () => {
    const manifest = generateDeploymentManifest(baseRequest({ requestedModules: ["core.contacts"] }));
    expect(manifest.enabledModules).toContain("core.contacts");
    expect(manifest.rejectedModules).toEqual([]);
  });
});

describe("generateDeploymentManifest — target", () => {
  it("cai no target padrão do plano quando não informado", () => {
    expect(generateDeploymentManifest(baseRequest({ plan: "lite" })).target).toBe("vercel");
    expect(generateDeploymentManifest(baseRequest({ plan: "dedicated" })).target).toBe("vps");
  });

  it("rejeita target incompatível com o plano (blocker)", () => {
    const manifest = generateDeploymentManifest(baseRequest({ plan: "lite", target: "vps" }));
    expect(manifest.valid).toBe(false);
    expect(manifest.blockers.some((b) => b.includes("target"))).toBe(true);
  });

  it("aceita target compatível explícito", () => {
    const manifest = generateDeploymentManifest(baseRequest({ plan: "lite", target: "cloudflare" }));
    expect(manifest.target).toBe("cloudflare");
    expect(manifest.blockers).toEqual([]);
  });
});

describe("generateDeploymentManifest — módulos", () => {
  it("rejeita channel.whatsapp no plano lite", () => {
    const manifest = generateDeploymentManifest(
      baseRequest({ plan: "lite", requestedModules: ["channel.whatsapp"] }),
    );
    expect(manifest.valid).toBe(false);
    expect(manifest.enabledModules).not.toContain("channel.whatsapp");
    expect(manifest.rejectedModules).toEqual([
      { moduleId: "channel.whatsapp", reason: "indisponível no plano contratado" },
    ]);
  });

  it("aceita channel.whatsapp no plano dedicated", () => {
    const manifest = generateDeploymentManifest(
      baseRequest({ plan: "dedicated", requestedModules: ["channel.whatsapp"] }),
    );
    expect(manifest.enabledModules).toContain("channel.whatsapp");
    expect(manifest.rejectedModules).toEqual([]);
  });

  it("rejeita automation.campaigns enquanto status = planned, mesmo em dedicated", () => {
    const manifest = generateDeploymentManifest(
      baseRequest({ plan: "dedicated", requestedModules: ["automation.campaigns"] }),
    );
    expect(manifest.valid).toBe(false);
    expect(manifest.enabledModules).not.toContain("automation.campaigns");
    expect(manifest.rejectedModules[0]?.reason).toContain("planned");
  });

  it("rejeita módulo inexistente no catálogo", () => {
    const manifest = generateDeploymentManifest(baseRequest({ requestedModules: ["nao.existe"] }));
    expect(manifest.valid).toBe(false);
    expect(manifest.rejectedModules[0]).toEqual({
      moduleId: "nao.existe",
      reason: "módulo inexistente no catálogo",
    });
  });

  it("dependência ausente: desligar core.contacts derruba channel.whatsapp em cascata (dedicated)", () => {
    const manifest = generateDeploymentManifest(
      baseRequest({
        plan: "dedicated",
        requestedModules: ["channel.whatsapp"],
        disabledModules: ["core.contacts"],
      }),
    );
    expect(manifest.valid).toBe(false);
    expect(manifest.enabledModules).not.toContain("channel.whatsapp");
    expect(manifest.enabledModules).not.toContain("core.contacts");
    const rejected = manifest.rejectedModules.find((r) => r.moduleId === "channel.whatsapp");
    expect(rejected?.reason).toContain("não está habilitado");
  });
});

describe("generateDeploymentManifest — variáveis de ambiente", () => {
  it("exige Supabase e os segredos criptográficos base em todo plano", () => {
    const manifest = generateDeploymentManifest(baseRequest());
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_DB_URL",
      "INTERNAL_SECRET",
      "CPF_ENCRYPTION_KEY",
      "AI_CRED_AES_KEY",
      "WAHA_BYO_ENCRYPTION_KEY",
    ]) {
      expect(manifest.environment.required).toContain(name);
    }
  });

  it("só exige variáveis do WAHA quando channel.whatsapp está habilitado", () => {
    const lite = generateDeploymentManifest(baseRequest({ plan: "lite" }));
    expect(lite.environment.required).not.toContain("WAHA_API_KEY");

    const dedicated = generateDeploymentManifest(
      baseRequest({ plan: "dedicated", requestedModules: ["channel.whatsapp"] }),
    );
    expect(dedicated.environment.required).toContain("WAHA_API_KEY");
    expect(dedicated.environment.required).toContain("WAHA_API_BASE_URL");
    expect(dedicated.environment.required).toContain("WAHA_WEBHOOK_BASE_URL");
  });

  it("exige DOMAIN/APP_IMAGE/ACME_EMAIL/SRH_TOKEN só no dedicated", () => {
    const lite = generateDeploymentManifest(baseRequest({ plan: "lite" }));
    expect(lite.environment.required).not.toContain("DOMAIN");

    const dedicated = generateDeploymentManifest(baseRequest({ plan: "dedicated" }));
    for (const name of ["DOMAIN", "APP_IMAGE", "ACME_EMAIL", "SRH_TOKEN"]) {
      expect(dedicated.environment.required).toContain(name);
    }
  });

  it("nomes de segredos aparecem só como string — sem valor associado", () => {
    const manifest = generateDeploymentManifest(baseRequest());
    const secretNames = manifest.environment.required.filter(
      (name) => !(name in manifest.environment.generatedPublicValues),
    );
    expect(secretNames.length).toBeGreaterThan(0);
    for (const name of secretNames) {
      expect(manifest.environment.generatedPublicValues[name]).toBeUndefined();
    }
  });
});

describe("generateDeploymentManifest — validação", () => {
  it("slug inválido vira blocker", () => {
    const manifest = generateDeploymentManifest(baseRequest({ clientSlug: "Slug Inválido!" }));
    expect(manifest.valid).toBe(false);
    expect(manifest.blockers.some((b) => b.includes("clientSlug"))).toBe(true);
  });

  it("domínio inválido vira blocker", () => {
    const manifest = generateDeploymentManifest(baseRequest({ domain: "http://com espaço" }));
    expect(manifest.valid).toBe(false);
    expect(manifest.blockers.some((b) => b.includes("domain"))).toBe(true);
  });

  it("branding válido não gera blocker nem warning", () => {
    const manifest = generateDeploymentManifest(
      baseRequest({
        branding: {
          appName: "Empresa Exemplo",
          supportEmail: "suporte@empresa.com.br",
          websiteUrl: "https://empresa.com.br",
          logoUrl: "https://empresa.com.br/logo.png",
        },
      }),
    );
    expect(manifest.blockers).toEqual([]);
    expect(manifest.warnings).toEqual([]);
  });

  it("e-mail de suporte malformado vira warning, não blocker", () => {
    const manifest = generateDeploymentManifest(
      baseRequest({ branding: { appName: "Empresa Exemplo", supportEmail: "nao-e-email" } }),
    );
    expect(manifest.warnings.some((w) => w.includes("supportEmail"))).toBe(true);
    expect(manifest.blockers).toEqual([]);
  });
});

describe("generateDeploymentManifest — manifesto nunca expõe valor de segredo", () => {
  it("nenhum campo do manifesto contém valor, só nomes de variável", () => {
    const manifest = generateDeploymentManifest(
      baseRequest({ plan: "dedicated", requestedModules: ["channel.whatsapp"] }),
    );
    // required/optional são listas de NOMES (todo item é um MAIÚSCULO_COM_underscore)
    for (const name of [...manifest.environment.required, ...manifest.environment.optional]) {
      expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
    // generatedPublicValues só tem as chaves públicas esperadas — nenhuma delas é segredo
    const secretLikeKeys = Object.keys(manifest.environment.generatedPublicValues).filter((k) =>
      /KEY|SECRET|TOKEN|PASSWORD/.test(k),
    );
    expect(secretLikeKeys).toEqual([]);
  });
});

describe("renderEnvTemplate", () => {
  it("usa placeholders <CONFIGURAR> para segredos, nunca valores reais", () => {
    const manifest = generateDeploymentManifest(baseRequest({ requestedModules: ["core.contacts"] }));
    const template = renderEnvTemplate(manifest);
    expect(template).toContain("SUPABASE_SERVICE_ROLE_KEY=<CONFIGURAR>");
    expect(template).toContain("SUPABASE_DB_URL=<CONFIGURAR>");
    expect(template).toContain('APP_NAME="Empresa Exemplo"');
    expect(template).toContain("DEPLOYMENT_PLAN=lite");
  });
});
