import { describe, expect, it } from "vitest";

import {
  COMMERCIAL_STATUS_CATALOG,
  getCommercialStatusDefinition,
  getInstallationStatusDefinition,
  getTechnicalStatusDefinition,
  INSTALLATION_STATUS_CATALOG,
  TECHNICAL_STATUS_CATALOG,
  validateStatusCatalogsCoverage,
} from "@/lib/control-plane/catalog";
import { COMMERCIAL_STATUSES, INSTALLATION_STATUSES, TECHNICAL_STATUSES } from "@/lib/control-plane/status";

describe("INSTALLATION_STATUS_CATALOG", () => {
  it("tem exatamente 1 definição por status do vocabulário", () => {
    expect(INSTALLATION_STATUS_CATALOG).toHaveLength(INSTALLATION_STATUSES.length);
    for (const status of INSTALLATION_STATUSES) {
      expect(INSTALLATION_STATUS_CATALOG.filter((d) => d.id === status)).toHaveLength(1);
    }
  });

  it("getInstallationStatusDefinition devolve label/description/category", () => {
    const def = getInstallationStatusDefinition("waiting_dns");
    expect(def.label).toBe("Aguardando DNS");
    expect(def.category).toBe("waiting");
    expect(def.isBlocking).toBe(true);
  });

  it("getInstallationStatusDefinition lança para id desconhecido", () => {
    // @ts-expect-error — testando runtime guard contra id fora do vocabulário
    expect(() => getInstallationStatusDefinition("nao-existe")).toThrow();
  });

  it("status ativos/operacionais não são isBlocking", () => {
    expect(getInstallationStatusDefinition("active").isBlocking).toBe(false);
    expect(getInstallationStatusDefinition("maintenance").isBlocking).toBe(false);
  });
});

describe("COMMERCIAL_STATUS_CATALOG", () => {
  it("tem exatamente 1 definição por status do vocabulário", () => {
    expect(COMMERCIAL_STATUS_CATALOG).toHaveLength(COMMERCIAL_STATUSES.length);
  });

  it("getCommercialStatusDefinition devolve label e rank", () => {
    const def = getCommercialStatusDefinition("production");
    expect(def.label).toBe("Em produção");
    expect(def.rank).toBe(6);
  });
});

describe("TECHNICAL_STATUS_CATALOG", () => {
  it("tem exatamente 1 definição por status do vocabulário", () => {
    expect(TECHNICAL_STATUS_CATALOG).toHaveLength(TECHNICAL_STATUSES.length);
  });

  it("getTechnicalStatusDefinition devolve label", () => {
    expect(getTechnicalStatusDefinition("failed").label).toBe("Falhou");
  });
});

describe("validateStatusCatalogsCoverage", () => {
  it("não encontra nenhuma divergência entre vocabulário e catálogo", () => {
    expect(validateStatusCatalogsCoverage()).toEqual([]);
  });
});
