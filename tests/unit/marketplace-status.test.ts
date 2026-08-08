import { describe, expect, it } from "vitest";

import { isLicenseTransitionValid, isOfferTransitionValid, isTrialTransitionValid } from "@/lib/marketplace/status";

describe("isLicenseTransitionValid", () => {
  it("draft → trial e draft → active são válidos", () => {
    expect(isLicenseTransitionValid("draft", "trial")).toBe(true);
    expect(isLicenseTransitionValid("draft", "active")).toBe(true);
  });

  it("cancelled e revoked são terminais — nenhuma transição sai deles", () => {
    expect(isLicenseTransitionValid("cancelled", "active")).toBe(false);
    expect(isLicenseTransitionValid("revoked", "active")).toBe(false);
  });

  it("expired → active é válido (renovação)", () => {
    expect(isLicenseTransitionValid("expired", "active")).toBe(true);
  });

  it("mesmo estado pra mesmo estado é válido quando não-terminal", () => {
    expect(isLicenseTransitionValid("active", "active")).toBe(true);
  });

  it("mesmo estado pra mesmo estado é inválido quando terminal", () => {
    expect(isLicenseTransitionValid("cancelled", "cancelled")).toBe(false);
  });
});

describe("isTrialTransitionValid", () => {
  it("scheduled → active é válido", () => {
    expect(isTrialTransitionValid("scheduled", "active")).toBe(true);
  });

  it("converted é terminal — não pode converter de novo nem reabrir", () => {
    expect(isTrialTransitionValid("converted", "active")).toBe(false);
    expect(isTrialTransitionValid("converted", "converted")).toBe(false);
  });

  it("expired é terminal", () => {
    expect(isTrialTransitionValid("expired", "active")).toBe(false);
  });
});

describe("isOfferTransitionValid", () => {
  it("draft → active é válido", () => {
    expect(isOfferTransitionValid("draft", "active")).toBe(true);
  });

  it("archived é terminal", () => {
    expect(isOfferTransitionValid("archived", "active")).toBe(false);
  });

  it("active → disabled → active é válido (pode reativar)", () => {
    expect(isOfferTransitionValid("active", "disabled")).toBe(true);
    expect(isOfferTransitionValid("disabled", "active")).toBe(true);
  });
});
