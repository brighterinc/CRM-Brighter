import { describe, expect, it } from "vitest";

import {
  FakeMonitoringAdapter,
  InMemoryMonitoringAdapter,
  NoopMonitoringAdapter,
  type MonitoringCheckExecutionContext,
} from "@/lib/monitoring/adapters";

const CTX: MonitoringCheckExecutionContext = {
  installationId: "install-1",
  tenantId: "tenant-1",
  plan: "dedicated",
  checkId: "database_reachable",
};

describe("NoopMonitoringAdapter", () => {
  it("supports() sempre true", () => {
    expect(new NoopMonitoringAdapter().supports("qualquer_check")).toBe(true);
  });

  it("nunca finge sucesso — sempre retorna 'skipped'", async () => {
    const result = await new NoopMonitoringAdapter().execute(CTX);
    expect(result.status).toBe("skipped");
    expect(result.checkId).toBe(CTX.checkId);
  });
});

describe("InMemoryMonitoringAdapter", () => {
  it("sem configuração, usa defaultStatus (healthy por padrão)", async () => {
    const result = await new InMemoryMonitoringAdapter().execute(CTX);
    expect(result.status).toBe("healthy");
  });

  it("respeita defaultStatus customizado", async () => {
    const adapter = new InMemoryMonitoringAdapter({ defaultStatus: "unknown" });
    const result = await adapter.execute(CTX);
    expect(result.status).toBe("unknown");
  });

  it("resultado configurado por checkId tem prioridade sobre defaultStatus", async () => {
    const adapter = new InMemoryMonitoringAdapter({
      results: new Map([["database_reachable", { status: "unhealthy", message: "falha simulada" }]]),
    });
    const result = await adapter.execute(CTX);
    expect(result.status).toBe("unhealthy");
    expect(result.message).toBe("falha simulada");
  });

  it("checkId sem configuração cai no defaultStatus mesmo com results parcial", async () => {
    const adapter = new InMemoryMonitoringAdapter({
      results: new Map([["outro_check", { status: "unhealthy" }]]),
    });
    const result = await adapter.execute(CTX);
    expect(result.status).toBe("healthy");
  });
});

describe("FakeMonitoringAdapter", () => {
  it("é uma instância de InMemoryMonitoringAdapter (mesma implementação, nome dedicado)", () => {
    expect(new FakeMonitoringAdapter()).toBeInstanceOf(InMemoryMonitoringAdapter);
  });

  it("se comporta identicamente ao InMemoryMonitoringAdapter configurado", async () => {
    const config = { results: new Map([["database_reachable", { status: "degraded" as const }]]) };
    const fake = new FakeMonitoringAdapter(config);
    const inMemory = new InMemoryMonitoringAdapter(config);

    const fakeResult = await fake.execute(CTX);
    const inMemoryResult = await inMemory.execute(CTX);
    expect(fakeResult.status).toBe(inMemoryResult.status);
  });
});
