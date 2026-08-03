import { describe, expect, it } from "vitest";

import { sanitizeMonitoringCheckResult, sanitizeMonitoringIncident } from "@/lib/monitoring/sanitization";
import type { MonitoringCheckResult, MonitoringIncident } from "@/lib/monitoring/types";

describe("sanitizeMonitoringCheckResult", () => {
  it("remove chaves sensíveis aninhadas de metadata, recursivamente", () => {
    const result: MonitoringCheckResult = {
      checkId: "supabase_project_configured",
      status: "healthy",
      observedAt: "2026-08-03T12:00:00.000Z",
      message: "ok",
      metadata: {
        projectRef: "abc123",
        databaseUrl: "postgres://user:pass@host/db",
        nested: { serviceRoleKey: "super-secreto", apiKey: "outro-secreto" },
      },
    };

    const sanitized = sanitizeMonitoringCheckResult(result);
    const json = JSON.stringify(sanitized);
    expect(json).not.toContain("postgres://user:pass@host/db");
    expect(json).not.toContain("super-secreto");
    expect(json).not.toContain("outro-secreto");
    expect((sanitized.metadata as Record<string, unknown>).projectRef).toBe("abc123");
  });

  it("sem metadata, devolve o mesmo objeto (não quebra)", () => {
    const result: MonitoringCheckResult = {
      checkId: "database_reachable",
      status: "healthy",
      observedAt: "2026-08-03T12:00:00.000Z",
      message: "ok",
    };
    expect(sanitizeMonitoringCheckResult(result)).toEqual(result);
  });
});

describe("sanitizeMonitoringIncident", () => {
  it("remove chaves sensíveis de metadata do incidente", () => {
    const incident: MonitoringIncident = {
      id: "incident-1",
      installationId: "install-1",
      tenantId: "tenant-1",
      title: "Banco de dados — indisponível",
      description: "banco fora",
      severity: "critical",
      status: "open",
      sourceCheckId: "database_reachable",
      openedAt: "2026-08-03T12:00:00.000Z",
      metadata: { connectionString: "postgres://segredo", note: "ok" },
    };

    const sanitized = sanitizeMonitoringIncident(incident);
    const json = JSON.stringify(sanitized);
    expect(json).not.toContain("postgres://segredo");
    expect((sanitized.metadata as Record<string, unknown>).note).toBe("ok");
  });
});
