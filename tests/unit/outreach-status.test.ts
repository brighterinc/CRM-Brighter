import { describe, expect, it } from "vitest";

import {
  isCadenceTransitionValid,
  isCampaignTransitionValid,
  isDeliveryTransitionValid,
  isEnrollmentTransitionValid,
} from "@/lib/outreach/status";

describe("isCampaignTransitionValid", () => {
  it("draft → scheduled é válido", () => {
    expect(isCampaignTransitionValid("draft", "scheduled")).toBe(true);
  });

  it("archived → qualquer coisa é inválido (terminal)", () => {
    expect(isCampaignTransitionValid("archived", "draft")).toBe(false);
    expect(isCampaignTransitionValid("archived", "active")).toBe(false);
  });

  it("mesmo estado pra mesmo estado é sempre válido", () => {
    expect(isCampaignTransitionValid("active", "active")).toBe(true);
  });

  it("completed → active é inválido (não reabre campanha concluída)", () => {
    expect(isCampaignTransitionValid("completed", "active")).toBe(false);
  });
});

describe("isCadenceTransitionValid", () => {
  it("draft → active é válido, completed → active é inválido", () => {
    expect(isCadenceTransitionValid("draft", "active")).toBe(true);
    expect(isCadenceTransitionValid("completed", "active")).toBe(false);
  });
});

describe("isEnrollmentTransitionValid", () => {
  it("pending → active é válido (ativação direta)", () => {
    expect(isEnrollmentTransitionValid("pending", "active")).toBe(true);
  });

  it("opted_out é terminal — nenhuma transição sai dele", () => {
    expect(isEnrollmentTransitionValid("opted_out", "active")).toBe(false);
    expect(isEnrollmentTransitionValid("opted_out", "completed")).toBe(false);
  });

  it("responded → qualified e responded → transferred são válidos", () => {
    expect(isEnrollmentTransitionValid("responded", "qualified")).toBe(true);
    expect(isEnrollmentTransitionValid("responded", "transferred")).toBe(true);
  });
});

describe("isDeliveryTransitionValid", () => {
  it("pending → scheduled é válido", () => {
    expect(isDeliveryTransitionValid("pending", "scheduled")).toBe(true);
  });

  it("replied é terminal", () => {
    expect(isDeliveryTransitionValid("replied", "sent")).toBe(false);
  });

  it("failed → scheduled é válido (retry)", () => {
    expect(isDeliveryTransitionValid("failed", "scheduled")).toBe(true);
  });
});
