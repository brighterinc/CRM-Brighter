import { afterEach, describe, expect, it } from "vitest";

import { buildInviteEmail } from "@/lib/email/templates/invite";
import { buildBudgetAlarmEmail } from "@/lib/email/templates/ai-budget-alarm";

// `branding()` decide servidor-vs-navegador por `typeof window`, e o ambiente
// de teste (jsdom) sempre define `window` — então mesmo estes módulos
// server-only seguem o caminho de navegador aqui e leem `window.__PUBLIC_ENV__`,
// não `process.env`. Stub via window, não `vi.stubEnv`.
afterEach(() => {
  delete window.__PUBLIC_ENV__;
});

describe("buildInviteEmail — marca configurável", () => {
  const baseOpts = {
    inviterName: "Maria",
    orgName: "Loja da Maria",
    acceptUrl: "https://app.exemplo.com/invite/abc",
    role: "agent",
    expiresAt: new Date("2026-08-08T12:00:00Z"),
  };

  it("usa DeskcommCRM (padrão) quando APP_NAME não está configurado", () => {
    const { subject, html } = buildInviteEmail(baseOpts);
    expect(subject).toContain("DeskcommCRM");
    expect(html).toContain("DeskcommCRM");
  });

  it("usa a marca configurada em vez de DeskcommCRM hardcoded", () => {
    window.__PUBLIC_ENV__ = { APP_NAME: "Vendas Turbo CRM" };
    const { subject, html } = buildInviteEmail(baseOpts);
    expect(subject).toContain("Vendas Turbo CRM");
    expect(subject).not.toContain("Deskcomm");
    expect(html).toContain("Vendas Turbo CRM");
    expect(html).not.toContain("Deskcomm");
  });
});

describe("buildBudgetAlarmEmail — marca configurável", () => {
  const baseOpts = {
    pct: 92.5,
    consumedCents: 92_500,
    limitCents: 100_000,
    dashboardUrl: "https://app.exemplo.com/ai/budget",
  };

  it("usa DeskcommCRM (padrão) quando APP_NAME não está configurado", () => {
    const { subject } = buildBudgetAlarmEmail(baseOpts);
    expect(subject).toContain("DeskcommCRM");
  });

  it("usa a marca configurada em vez de DeskcommCRM hardcoded", () => {
    window.__PUBLIC_ENV__ = { APP_NAME: "Vendas Turbo CRM" };
    const { subject } = buildBudgetAlarmEmail(baseOpts);
    expect(subject).toContain("Vendas Turbo CRM");
    expect(subject).not.toContain("Deskcomm");
  });
});
