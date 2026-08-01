/**
 * Testa `isNavItemVisible` (função pura extraída de Sidebar.tsx) em vez de
 * montar o componente inteiro — mesmo padrão de `visibleInboxTabs` em
 * InboxFilters.tsx. Montar <Sidebar> exigiria mock pesado de AuthProvider,
 * usePathname e branding() só pra repetir a mesma asserção; a lógica de
 * visibilidade em si é o que precisa de cobertura.
 */
import { describe, expect, it } from "vitest";

import { isNavItemVisible } from "@/components/shell/nav-items";

const ALL_PERMS = {
  "lgpd.execute_redact": true,
  "ai.agents.view": true,
  "ai.routers.view": true,
  "ai.memory.view": true,
  "ai.skills.view": true,
  "ai.evolution.view": true,
  "webhooks.manage": true,
};

describe("isNavItemVisible", () => {
  it("item sem permission nem moduleId sempre visível", () => {
    expect(
      isNavItemVisible(
        { href: "/app/inbox", label: "Inbox", icon: (() => null) as never },
        { permissions: {}, enabledModuleIds: [] },
      ),
    ).toBe(true);
  });

  it("esconde item cujo moduleId não está em enabledModuleIds", () => {
    const item = {
      href: "/app/webhooks",
      label: "Webhooks",
      icon: (() => null) as never,
      permission: "webhooks.manage",
      moduleId: "automation.webhooks",
    };
    expect(isNavItemVisible(item, { permissions: ALL_PERMS, enabledModuleIds: [] })).toBe(false);
  });

  it("mostra item cujo moduleId está em enabledModuleIds e a permissão bate", () => {
    const item = {
      href: "/app/webhooks",
      label: "Webhooks",
      icon: (() => null) as never,
      permission: "webhooks.manage",
      moduleId: "automation.webhooks",
    };
    expect(
      isNavItemVisible(item, { permissions: ALL_PERMS, enabledModuleIds: ["automation.webhooks"] }),
    ).toBe(true);
  });

  it("permissão faltando esconde o item mesmo com módulo ligado", () => {
    const item = {
      href: "/app/ai/agents",
      label: "Agentes IA",
      icon: (() => null) as never,
      permission: "ai.agents.view",
      moduleId: "ai.agents",
    };
    expect(
      isNavItemVisible(item, {
        permissions: { ...ALL_PERMS, "ai.agents.view": false },
        enabledModuleIds: ["ai.agents"],
      }),
    ).toBe(false);
  });

  it.each([
    ["channel.whatsapp", "Conexões"],
    ["ai.agents", "Agentes IA"],
    ["ai.memory", "Memória da IA"],
    ["automation.webhooks", "Webhooks"],
    ["automation.followups", "Follow-ups"],
    ["analytics.metrics", "Desempenho"],
    ["compliance.lgpd", "LGPD"],
  ])("módulo %s desligado esconde o item %s", (moduleId, label) => {
    const item = {
      href: "/x",
      label,
      icon: (() => null) as never,
      moduleId,
    };
    expect(isNavItemVisible(item, { permissions: ALL_PERMS, enabledModuleIds: [] })).toBe(false);
  });
});
