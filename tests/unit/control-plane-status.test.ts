import { describe, expect, it } from "vitest";

import {
  COMMERCIAL_STATUS_RANK,
  COMMERCIAL_STATUSES,
  INSTALLATION_STATUSES,
  isCommercialStatus,
  isInstallationStatus,
  isTechnicalStatus,
  TECHNICAL_STATUS_RANK,
  TECHNICAL_STATUSES,
  TERMINAL_INSTALLATION_STATUSES,
  WAITING_INSTALLATION_STATUSES,
} from "@/lib/control-plane/status";

describe("vocabulário de status", () => {
  it("INSTALLATION_STATUSES tem os 11 status esperados", () => {
    expect(INSTALLATION_STATUSES).toHaveLength(11);
    expect(new Set(INSTALLATION_STATUSES).size).toBe(11);
  });

  it("COMMERCIAL_STATUSES tem os 7 status esperados", () => {
    expect(COMMERCIAL_STATUSES).toHaveLength(7);
    expect(new Set(COMMERCIAL_STATUSES).size).toBe(7);
  });

  it("TECHNICAL_STATUSES tem os 7 status esperados", () => {
    expect(TECHNICAL_STATUSES).toHaveLength(7);
    expect(new Set(TECHNICAL_STATUSES).size).toBe(7);
  });

  it("isInstallationStatus aceita válido e rejeita inválido", () => {
    expect(isInstallationStatus("active")).toBe(true);
    expect(isInstallationStatus("bogus")).toBe(false);
  });

  it("isCommercialStatus aceita válido e rejeita inválido", () => {
    expect(isCommercialStatus("contract")).toBe(true);
    expect(isCommercialStatus("contracted")).toBe(false);
  });

  it("isTechnicalStatus aceita válido e rejeita inválido", () => {
    expect(isTechnicalStatus("running")).toBe(true);
    expect(isTechnicalStatus("live")).toBe(false);
  });

  it("WAITING_INSTALLATION_STATUSES contém só os 3 status de espera", () => {
    expect(new Set(WAITING_INSTALLATION_STATUSES)).toEqual(
      new Set(["waiting_dns", "waiting_ssl", "waiting_customer"]),
    );
  });

  it("TERMINAL_INSTALLATION_STATUSES contém archived e error", () => {
    expect(new Set(TERMINAL_INSTALLATION_STATUSES)).toEqual(new Set(["archived", "error"]));
  });

  it("COMMERCIAL_STATUS_RANK cobre todo o vocabulário e cancelled é 0", () => {
    for (const status of COMMERCIAL_STATUSES) {
      expect(COMMERCIAL_STATUS_RANK[status]).toBeTypeOf("number");
    }
    expect(COMMERCIAL_STATUS_RANK.cancelled).toBe(0);
    expect(COMMERCIAL_STATUS_RANK.production).toBeGreaterThan(COMMERCIAL_STATUS_RANK.lead);
  });

  it("TECHNICAL_STATUS_RANK cobre todo o vocabulário e warning/failed ficam fora da escada", () => {
    for (const status of TECHNICAL_STATUSES) {
      expect(TECHNICAL_STATUS_RANK[status]).toBeTypeOf("number");
    }
    expect(TECHNICAL_STATUS_RANK.warning).toBe(-1);
    expect(TECHNICAL_STATUS_RANK.failed).toBe(-1);
    expect(TECHNICAL_STATUS_RANK.running).toBeGreaterThan(TECHNICAL_STATUS_RANK.draft);
  });
});
