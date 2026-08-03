import { describe, expect, it } from "vitest";

import { createDemoInstallations } from "@/lib/control-plane/repository";
import {
  generateControlPlaneSummary,
  renderControlPlaneSummaryMarkdown,
  selectWaitingInstallations,
} from "@/lib/control-plane/summary";

describe("generateControlPlaneSummary", () => {
  const installations = createDemoInstallations();
  const summary = generateControlPlaneSummary(installations);

  it("total bate com o tamanho da lista", () => {
    expect(summary.total).toBe(installations.length);
  });

  it("byPlan cobre os três planos de demonstração", () => {
    expect(summary.byPlan.lite).toBe(1);
    expect(summary.byPlan.pro).toBe(1);
    expect(summary.byPlan.dedicated).toBe(1);
  });

  it("byStatus soma exatamente o total", () => {
    const sum = Object.values(summary.byStatus).reduce((a, b) => a + b, 0);
    expect(sum).toBe(summary.total);
  });

  it("byCommercial soma exatamente o total", () => {
    const sum = Object.values(summary.byCommercial).reduce((a, b) => a + b, 0);
    expect(sum).toBe(summary.total);
  });

  it("byTechnical soma exatamente o total", () => {
    const sum = Object.values(summary.byTechnical).reduce((a, b) => a + b, 0);
    expect(sum).toBe(summary.total);
  });

  it("active conta só instalações com status active", () => {
    expect(summary.active).toBe(installations.filter((i) => i.status === "active").length);
  });

  it("inProvisioning conta provisioning + deploying", () => {
    const expected = installations.filter((i) => i.status === "provisioning" || i.status === "deploying").length;
    expect(summary.inProvisioning).toBe(expected);
  });

  it("withErrors conta status error OU technical failed", () => {
    const expected = installations.filter((i) => i.status === "error" || i.technical === "failed").length;
    expect(summary.withErrors).toBe(expected);
  });

  it("totalActiveModules conta módulos DISTINTOS, nunca soma bruta", () => {
    const distinct = new Set(installations.flatMap((i) => i.modules)).size;
    expect(summary.totalActiveModules).toBe(distinct);
    const bruteSum = installations.reduce((sum, i) => sum + i.modules.length, 0);
    if (bruteSum !== distinct) {
      expect(summary.totalActiveModules).not.toBe(bruteSum);
    }
  });

  it("generatedAt é um ISO-8601 válido", () => {
    expect(() => new Date(summary.generatedAt).toISOString()).not.toThrow();
  });

  it("lista vazia produz resumo zerado, nunca lança", () => {
    const empty = generateControlPlaneSummary([]);
    expect(empty.total).toBe(0);
    expect(empty.active).toBe(0);
    expect(empty.totalActiveModules).toBe(0);
  });
});

describe("selectWaitingInstallations", () => {
  it("só devolve instalações com status de espera (DNS/SSL/cliente)", () => {
    const installations = createDemoInstallations();
    const waiting = selectWaitingInstallations(installations);
    expect(waiting.every((i) => ["waiting_dns", "waiting_ssl", "waiting_customer"].includes(i.status))).toBe(true);
  });
});

describe("renderControlPlaneSummaryMarkdown", () => {
  it("gera Markdown com as seções esperadas", () => {
    const summary = generateControlPlaneSummary(createDemoInstallations());
    const markdown = renderControlPlaneSummaryMarkdown(summary);

    expect(markdown).toContain("# Control Plane");
    expect(markdown).toContain("## Por plano");
    expect(markdown).toContain("## Por status");
    expect(markdown).toContain(String(summary.total));
  });
});
