import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_APP_NAME, resolveBranding } from "@/lib/branding";

const RAIZ = process.cwd();

describe("resolveBranding", () => {
  it("cai no padrão quando não há marca configurada", () => {
    expect(resolveBranding({})).toEqual({
      name: DEFAULT_APP_NAME,
      logoUrl: null,
      initial: "D",
      supportEmail: null,
      legalName: DEFAULT_APP_NAME,
      websiteUrl: null,
      fromName: DEFAULT_APP_NAME,
      fromEmail: null,
      faviconUrl: null,
    });
  });

  it("trata string vazia e só-espaços como ausência de marca", () => {
    // `install.sh` grava a chave declarada mesmo quando o operador não responde
    // (APP_NAME=), então "vazio" chega como string — não como undefined. Tratar
    // isso como marca válida deixaria a interface sem nome nenhum.
    const empty = resolveBranding({
      name: "",
      logoUrl: "",
      supportEmail: "",
      legalName: "  ",
      websiteUrl: "   ",
      fromName: "",
      fromEmail: "  ",
      faviconUrl: "",
    });
    expect(empty.name).toBe(DEFAULT_APP_NAME);
    expect(empty.logoUrl).toBeNull();
    expect(empty.supportEmail).toBeNull();
    expect(empty.legalName).toBe(DEFAULT_APP_NAME);
    expect(empty.websiteUrl).toBeNull();
    expect(empty.fromName).toBe(DEFAULT_APP_NAME);
    expect(empty.fromEmail).toBeNull();
    expect(empty.faviconUrl).toBeNull();
  });

  it("usa a marca configurada e deriva a inicial", () => {
    const b = resolveBranding({
      name: "  Vendas Turbo  ",
      logoUrl: "  https://cdn.exemplo.com/logo.svg  ",
    });
    expect(b.name).toBe("Vendas Turbo");
    expect(b.logoUrl).toBe("https://cdn.exemplo.com/logo.svg");
    expect(b.initial).toBe("V");
  });

  it("mantém o nome mas dispensa o logo quando só o nome é configurado", () => {
    const b = resolveBranding({ name: "Acme CRM" });
    expect(b.name).toBe("Acme CRM");
    expect(b.logoUrl).toBeNull();
  });

  it("não parte code point ao derivar a inicial", () => {
    // `[0]` cru devolveria metade do par substituto e renderizaria caractere
    // inválido na sidebar recolhida.
    expect(resolveBranding({ name: "🚀 Foguete" }).initial).toBe("🚀");
    expect(resolveBranding({ name: "Ótimo CRM" }).initial).toBe("Ó");
  });

  it("resolve os campos de contato quando configurados", () => {
    const b = resolveBranding({
      name: "Acme CRM",
      supportEmail: "  suporte@acme.com.br  ",
      legalName: "  Acme Soluções Ltda  ",
      websiteUrl: "  https://acme.com.br  ",
      fromName: "  Acme  ",
      fromEmail: "  contato@acme.com.br  ",
      faviconUrl: "  https://cdn.acme.com.br/favicon.ico  ",
    });
    expect(b.supportEmail).toBe("suporte@acme.com.br");
    expect(b.legalName).toBe("Acme Soluções Ltda");
    expect(b.websiteUrl).toBe("https://acme.com.br");
    expect(b.fromName).toBe("Acme");
    expect(b.fromEmail).toBe("contato@acme.com.br");
    expect(b.faviconUrl).toBe("https://cdn.acme.com.br/favicon.ico");
  });

  it("legalName e fromName caem no nome resolvido quando ausentes", () => {
    const b = resolveBranding({ name: "Vendas Turbo" });
    expect(b.legalName).toBe("Vendas Turbo");
    expect(b.fromName).toBe("Vendas Turbo");
  });

  it("supportEmail, websiteUrl, fromEmail e faviconUrl nunca são inventados", () => {
    const b = resolveBranding({ name: "Vendas Turbo" });
    expect(b.supportEmail).toBeNull();
    expect(b.websiteUrl).toBeNull();
    expect(b.fromEmail).toBeNull();
    expect(b.faviconUrl).toBeNull();
  });
});

describe("guarda de white-label (self-host)", () => {
  const branding = fs.readFileSync(path.join(RAIZ, "lib/branding.ts"), "utf8");
  const publicEnvScript = fs.readFileSync(
    path.join(RAIZ, "app/public-env-script.tsx"),
    "utf8",
  );

  it("não usa prefixo NEXT_PUBLIC_ para a marca", () => {
    // POR QUE ESTE TESTE EXISTE: a convenção do Next empurra qualquer valor lido
    // no browser para NEXT_PUBLIC_*, e alguém vai "corrigir" isso um dia. Mas
    // NEXT_PUBLIC_* é queimada no bundle durante o `next build`, e o self-hoster
    // roda uma imagem PRÉ-BUILDADA: a marca dele nunca apareceria. O defeito
    // passaria em typecheck, lint e em toda a suíte, funcionaria em dev e na
    // Vercel, e falharia apenas na VPS de quem a feature existe para servir.
    expect(branding).not.toMatch(/NEXT_PUBLIC_APP_/);
    expect(publicEnvScript).not.toMatch(/NEXT_PUBLIC_APP_/);
  });

  it("injeta a marca em runtime pelo PublicEnvScript", () => {
    // Sem estas chaves no payload, os client components (Sidebar, AdminSidebar)
    // caem no padrão e só a marca do servidor muda — a instalação ficaria com o
    // nome do revendedor no título da aba e o nosso na sidebar.
    expect(publicEnvScript).toMatch(/APP_NAME:\s*env\.APP_NAME/);
    expect(publicEnvScript).toMatch(/APP_LOGO_URL:\s*env\.APP_LOGO_URL/);
    expect(publicEnvScript).toMatch(/APP_SUPPORT_EMAIL:\s*env\.APP_SUPPORT_EMAIL/);
    expect(publicEnvScript).toMatch(/APP_WEBSITE_URL:\s*env\.APP_WEBSITE_URL/);
    expect(publicEnvScript).toMatch(/APP_FAVICON_URL:\s*env\.APP_FAVICON_URL/);
  });

  it("nunca expõe legalName/fromName/fromEmail ao navegador", () => {
    // Esses só existem em PDF/e-mail gerados no servidor — não são segredo, mas
    // também não têm por que trafegar até o browser.
    expect(publicEnvScript).not.toMatch(/APP_LEGAL_NAME/);
    expect(publicEnvScript).not.toMatch(/APP_FROM_NAME/);
    expect(publicEnvScript).not.toMatch(/APP_FROM_EMAIL/);
  });

  it("a marca não voltou a ser hardcoded na interface", () => {
    // Varre as superfícies que o usuário final vê. `app/design/` fica de fora:
    // é o showcase interno do design system, onde o nome do produto é o assunto.
    const alvos: string[] = [];
    const varrer = (dir: string) => {
      for (const entrada of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
        const rel = path.posix.join(dir, entrada.name);
        if (rel.startsWith("app/design")) continue;
        if (entrada.isDirectory()) varrer(rel);
        else if (rel.endsWith(".tsx")) alvos.push(rel);
      }
    };
    varrer("app");
    varrer("components");

    const reincidentes = alvos.filter((f) =>
      /Deskcomm/.test(fs.readFileSync(path.join(RAIZ, f), "utf8")),
    );
    expect(
      reincidentes,
      `estes arquivos voltaram a fixar a marca na interface — use branding() de lib/branding.ts:\n` +
        reincidentes.map((f) => `  ${f}`).join("\n"),
    ).toEqual([]);
  });
});
