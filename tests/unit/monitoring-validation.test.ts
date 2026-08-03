import { describe, expect, it } from "vitest";

import { validateMonitoringCheckResult, validateMonitoringSnapshotInput } from "@/lib/monitoring/validation";
import type { MonitoringCheckResult, MonitoringSnapshot } from "@/lib/monitoring/types";

function validResult(overrides: Partial<MonitoringCheckResult> = {}): MonitoringCheckResult {
  return {
    checkId: "database_reachable",
    status: "healthy",
    observedAt: "2026-08-03T12:00:00.000Z",
    message: "ok",
    ...overrides,
  };
}

describe("validateMonitoringCheckResult", () => {
  it("resultado válido não produz erro", () => {
    expect(validateMonitoringCheckResult(validResult())).toEqual([]);
  });

  it("checkId desconhecido no catálogo produz erro", () => {
    const errors = validateMonitoringCheckResult(validResult({ checkId: "check_inexistente" }));
    expect(errors.some((e) => e.field === "checkId")).toBe(true);
  });

  it("status inválido produz erro", () => {
    const errors = validateMonitoringCheckResult(validResult({ status: "sla-la-la" as never }));
    expect(errors.some((e) => e.field === "status")).toBe(true);
  });

  it("observedAt inválido produz erro", () => {
    const errors = validateMonitoringCheckResult(validResult({ observedAt: "nao-e-data" }));
    expect(errors.some((e) => e.field === "observedAt")).toBe(true);
  });

  it("message vazia produz erro", () => {
    const errors = validateMonitoringCheckResult(validResult({ message: "" }));
    expect(errors.some((e) => e.field === "message")).toBe(true);
  });

  it("durationMs negativo produz erro", () => {
    const errors = validateMonitoringCheckResult(validResult({ durationMs: -5 }));
    expect(errors.some((e) => e.field === "durationMs")).toBe(true);
  });
});

function validSnapshot(overrides: Partial<MonitoringSnapshot> = {}): MonitoringSnapshot {
  return {
    id: "snap-1",
    installationId: "install-1",
    tenantId: "tenant-1",
    plan: "dedicated",
    status: "completed",
    overallHealth: "healthy",
    score: 100,
    checks: [validResult()],
    incidents: [],
    blockers: [],
    warnings: [],
    missingCheckIds: [],
    lateCheckIds: [],
    createdAt: "2026-08-03T12:00:00.000Z",
    ...overrides,
  };
}

describe("validateMonitoringSnapshotInput", () => {
  it("snapshot válido não produz erro", () => {
    expect(validateMonitoringSnapshotInput(validSnapshot())).toEqual([]);
  });

  it("score fora de 0-100 produz erro", () => {
    expect(validateMonitoringSnapshotInput(validSnapshot({ score: 150 })).some((e) => e.field === "score")).toBe(true);
    expect(validateMonitoringSnapshotInput(validSnapshot({ score: -1 })).some((e) => e.field === "score")).toBe(true);
  });

  it("installationId/tenantId vazios produzem erro", () => {
    const errors = validateMonitoringSnapshotInput(validSnapshot({ installationId: "", tenantId: "" }));
    expect(errors.some((e) => e.field === "installationId")).toBe(true);
    expect(errors.some((e) => e.field === "tenantId")).toBe(true);
  });

  it("erros de check aninhado usam prefixo checks[i]", () => {
    const errors = validateMonitoringSnapshotInput(
      validSnapshot({ checks: [validResult({ checkId: "check_inexistente" })] }),
    );
    expect(errors.some((e) => e.field === "checks[0].checkId")).toBe(true);
  });
});
