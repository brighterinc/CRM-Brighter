import { describe, expect, it } from "vitest";

import { createDemoInstallations } from "@/lib/control-plane/repository";
import type { Installation } from "@/lib/control-plane/types";
import { evaluateMonitoringSnapshot, resolveApplicableMonitoringChecks, simulateMonitoringRun } from "@/lib/monitoring/evaluator";
import type { MonitoringCheckResult } from "@/lib/monitoring/types";

function findInstallation(plan: Installation["deploymentPlan"]): Installation {
  const installation = createDemoInstallations().find((i) => i.deploymentPlan === plan);
  if (!installation) throw new Error(`fixture de demonstração não tem instalação "${plan}"`);
  return installation;
}

describe("resolveApplicableMonitoringChecks", () => {
  it("Lite nunca exige Redis/worker/scheduler nem canal WhatsApp", () => {
    const applicable = resolveApplicableMonitoringChecks(findInstallation("lite"));
    const ids = applicable.map((c) => c.id);
    expect(ids).not.toContain("redis_available");
    expect(ids).not.toContain("worker_running");
    expect(ids).not.toContain("whatsapp_channel_configured");
    expect(ids).not.toContain("waha_available");
    expect(ids).not.toContain("vps_reachable");
  });

  it("Lite ainda aplica os checks comuns (aplicação, DNS, SSL, banco)", () => {
    const applicable = resolveApplicableMonitoringChecks(findInstallation("lite"));
    const ids = applicable.map((c) => c.id);
    expect(ids).toContain("application_reachable");
    expect(ids).toContain("dns_resolves");
    expect(ids).toContain("ssl_valid");
    expect(ids).toContain("database_reachable");
    expect(ids).toContain("frontend_deployment_available");
  });

  it("Dedicated com channel.whatsapp habilitado exige WhatsApp/WAHA", () => {
    const installation = findInstallation("dedicated");
    expect(installation.modules).toContain("channel.whatsapp");
    const ids = resolveApplicableMonitoringChecks(installation).map((c) => c.id);
    expect(ids).toContain("whatsapp_channel_configured");
    expect(ids).toContain("waha_available");
    expect(ids).toContain("vps_reachable");
  });

  it("chatwoot_available/evolution_available nunca são aplicáveis (módulo inexistente no Module Engine)", () => {
    for (const plan of ["lite", "pro", "dedicated"] as const) {
      const ids = resolveApplicableMonitoringChecks(findInstallation(plan)).map((c) => c.id);
      expect(ids).not.toContain("chatwoot_available");
      expect(ids).not.toContain("evolution_available");
    }
  });
});

describe("evaluateMonitoringSnapshot", () => {
  it("todos os checks aplicáveis saudáveis → overallHealth healthy, score 100", () => {
    const installation = findInstallation("lite");
    const applicable = resolveApplicableMonitoringChecks(installation);
    const now = new Date("2026-08-03T12:00:00.000Z");
    const results: MonitoringCheckResult[] = applicable.map((def) => ({
      checkId: def.id,
      status: "healthy",
      observedAt: now.toISOString(),
      message: "ok",
    }));

    const snapshot = evaluateMonitoringSnapshot({ installation, results, now });
    expect(snapshot.overallHealth).toBe("healthy");
    expect(snapshot.score).toBe(100);
    expect(snapshot.blockers).toEqual([]);
    expect(snapshot.warnings).toEqual([]);
    expect(snapshot.missingCheckIds).toEqual([]);
  });

  it("check crítico unhealthy → overallHealth unhealthy, vira blocker", () => {
    const installation = findInstallation("lite");
    const applicable = resolveApplicableMonitoringChecks(installation);
    const now = new Date("2026-08-03T12:00:00.000Z");
    const results: MonitoringCheckResult[] = applicable.map((def) => ({
      checkId: def.id,
      status: def.id === "database_reachable" ? "unhealthy" : "healthy",
      observedAt: now.toISOString(),
      message: def.id === "database_reachable" ? "banco inacessível" : "ok",
    }));

    const snapshot = evaluateMonitoringSnapshot({ installation, results, now });
    expect(snapshot.overallHealth).toBe("unhealthy");
    expect(snapshot.blockers.length).toBe(1);
    expect(snapshot.blockers[0]).toContain("banco inacessível");
  });

  it("check warning degraded → overallHealth degraded (nunca unhealthy)", () => {
    const installation = findInstallation("lite");
    const applicable = resolveApplicableMonitoringChecks(installation);
    const now = new Date("2026-08-03T12:00:00.000Z");
    const results: MonitoringCheckResult[] = applicable.map((def) => ({
      checkId: def.id,
      status: def.id === "storage_available" ? "degraded" : "healthy",
      observedAt: now.toISOString(),
      message: "ok",
    }));

    const snapshot = evaluateMonitoringSnapshot({ installation, results, now });
    expect(snapshot.overallHealth).toBe("degraded");
    expect(snapshot.blockers).toEqual([]);
    expect(snapshot.warnings.length).toBe(1);
  });

  it("check obrigatório ausente vira 'unknown' e entra em missingCheckIds", () => {
    const installation = findInstallation("lite");
    const applicable = resolveApplicableMonitoringChecks(installation);
    const now = new Date("2026-08-03T12:00:00.000Z");
    const results: MonitoringCheckResult[] = applicable
      .filter((def) => def.id !== "database_reachable")
      .map((def) => ({ checkId: def.id, status: "healthy", observedAt: now.toISOString(), message: "ok" }));

    const snapshot = evaluateMonitoringSnapshot({ installation, results, now });
    expect(snapshot.missingCheckIds).toContain("database_reachable");
    // database_reachable é crítico → ausência também é blocker/unhealthy.
    expect(snapshot.overallHealth).toBe("unhealthy");
    expect(snapshot.status).toBe("partial");
  });

  it("check atrasado (observedAt fora da janela de cadência) entra em lateCheckIds", () => {
    const installation = findInstallation("lite");
    const applicable = resolveApplicableMonitoringChecks(installation);
    const now = new Date("2026-08-03T12:00:00.000Z");
    const staleObservedAt = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(); // 5h atrás, cadência hourly (grace 2h)
    const results: MonitoringCheckResult[] = applicable.map((def) => ({
      checkId: def.id,
      status: "healthy",
      observedAt: def.id === "application_reachable" ? staleObservedAt : now.toISOString(),
      message: "ok",
    }));

    const snapshot = evaluateMonitoringSnapshot({ installation, results, now });
    expect(snapshot.lateCheckIds).toContain("application_reachable");
  });

  it("status 'disabled' não penaliza nem soma no score", () => {
    const installation = findInstallation("lite");
    const applicable = resolveApplicableMonitoringChecks(installation);
    const now = new Date("2026-08-03T12:00:00.000Z");

    const allHealthy: MonitoringCheckResult[] = applicable.map((def) => ({
      checkId: def.id,
      status: "healthy",
      observedAt: now.toISOString(),
      message: "ok",
    }));
    const baseline = evaluateMonitoringSnapshot({ installation, results: allHealthy, now });

    const oneDisabled: MonitoringCheckResult[] = applicable.map((def) => ({
      checkId: def.id,
      status: def.id === "monitoring_configured" ? "disabled" : "healthy",
      observedAt: now.toISOString(),
      message: "ok",
    }));
    const withDisabled = evaluateMonitoringSnapshot({ installation, results: oneDisabled, now });

    expect(baseline.score).toBe(100);
    expect(withDisabled.score).toBe(100); // exclui dos dois lados — não derruba o score
    expect(withDisabled.overallHealth).toBe("healthy");
  });

  it("sem nenhum resultado, todos os checks comuns entram como ausentes — score determinístico, sem exceção", () => {
    const installation = findInstallation("lite");
    const snapshot = evaluateMonitoringSnapshot({
      installation,
      results: [],
      now: new Date("2026-08-03T12:00:00.000Z"),
    });
    expect(snapshot.missingCheckIds.length).toBeGreaterThan(0);
    expect(Number.isFinite(snapshot.score)).toBe(true);
    expect(snapshot.score).toBeGreaterThanOrEqual(0);
    expect(snapshot.score).toBeLessThanOrEqual(100);
    expect(snapshot.overallHealth).toBe("unhealthy"); // vários checks comuns são críticos
  });

  it("score é sempre um inteiro entre 0 e 100", () => {
    const installation = findInstallation("dedicated");
    for (const scenario of ["healthy", "degraded", "critical", "multiple-critical"] as const) {
      const snapshot = simulateMonitoringRun(installation, scenario);
      expect(Number.isInteger(snapshot.score)).toBe(true);
      expect(snapshot.score).toBeGreaterThanOrEqual(0);
      expect(snapshot.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("simulateMonitoringRun — determinismo", () => {
  it("mesmo cenário, mesma instalação → mesma saúde geral e mesmo score em chamadas repetidas", () => {
    const installation = findInstallation("dedicated");
    const first = simulateMonitoringRun(installation, "critical");
    const second = simulateMonitoringRun(installation, "critical");
    expect(first.overallHealth).toBe(second.overallHealth);
    expect(first.score).toBe(second.score);
    expect(first.blockers).toEqual(second.blockers);
  });

  it("cenário 'missing-checks' produz ao menos 1 check aplicável ausente", () => {
    const installation = findInstallation("dedicated");
    const snapshot = simulateMonitoringRun(installation, "missing-checks");
    expect(snapshot.missingCheckIds.length).toBeGreaterThan(0);
  });

  it("cenário 'stale-checks' produz ao menos 1 check atrasado", () => {
    const installation = findInstallation("dedicated");
    const snapshot = simulateMonitoringRun(installation, "stale-checks");
    expect(snapshot.lateCheckIds.length).toBeGreaterThan(0);
  });

  it("cenário 'whatsapp-down' só afeta instalação com channel.whatsapp ativo", () => {
    const dedicated = findInstallation("dedicated");
    const lite = findInstallation("lite");

    const dedicatedSnapshot = simulateMonitoringRun(dedicated, "whatsapp-down");
    const liteSnapshot = simulateMonitoringRun(lite, "whatsapp-down");

    expect(dedicatedSnapshot.overallHealth).toBe("unhealthy");
    expect(liteSnapshot.overallHealth).toBe("healthy"); // Lite nunca tem os checks de WhatsApp aplicáveis
  });

  it("cenário 'redis-failure' só afeta instalação Dedicated com Redis exigido", () => {
    const dedicated = findInstallation("dedicated");
    const lite = findInstallation("lite");

    const liteSnapshot = simulateMonitoringRun(lite, "redis-failure");
    expect(liteSnapshot.overallHealth).toBe("healthy"); // Lite nunca tem redis_available aplicável

    const dedicatedApplicable = resolveApplicableMonitoringChecks(dedicated).map((c) => c.id);
    if (dedicatedApplicable.includes("redis_available")) {
      const dedicatedSnapshot = simulateMonitoringRun(dedicated, "redis-failure");
      expect(dedicatedSnapshot.overallHealth).toBe("unhealthy");
    }
  });
});
