import { beforeEach, describe, expect, it, vi } from "vitest";

const isModuleEnabledMock = vi.fn<(id: string) => boolean>();
vi.mock("@/lib/modules/runtime", () => ({
  isModuleEnabled: (id: string) => isModuleEnabledMock(id),
}));

const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));

import { requireModule } from "@/lib/modules/guard";

describe("requireModule (proteção de rota)", () => {
  beforeEach(() => {
    isModuleEnabledMock.mockReset();
    notFoundMock.mockClear();
  });

  it("deixa passar sem lançar quando o módulo está ligado", () => {
    isModuleEnabledMock.mockReturnValue(true);
    expect(() => requireModule("ai.agents")).not.toThrow();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("chama notFound() (404) quando o módulo está desligado — nunca renderiza parcial", () => {
    isModuleEnabledMock.mockReturnValue(false);
    expect(() => requireModule("channel.whatsapp")).toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("consulta isModuleEnabled com o id exato recebido", () => {
    isModuleEnabledMock.mockReturnValue(true);
    requireModule("automation.webhooks");
    expect(isModuleEnabledMock).toHaveBeenCalledWith("automation.webhooks");
  });
});
