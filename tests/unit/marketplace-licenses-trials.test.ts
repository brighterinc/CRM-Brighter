import { describe, expect, it } from "vitest";

import {
  activateLicense,
  cancelLicense,
  changeLicenseVersion,
  convertTrialToLicense,
  createLicense,
  expireLicense,
  renewLicense,
  revokeLicense,
  startLicenseGracePeriod,
  suspendLicense,
} from "@/lib/marketplace/licenses";
import { cancelTrial, convertTrial, createTrial, expireTrial, hasActiveTrial, startTrial, TrialNotAvailableError } from "@/lib/marketplace/trials";
import { MarketplaceInvalidTransitionError } from "@/lib/marketplace/status";
import { resolveMarketplaceModule } from "@/lib/marketplace/catalog";
import type { ModuleTrial } from "@/lib/marketplace/types";

const NOW = "2026-01-01T00:00:00.000Z";

function baseLicense() {
  return createLicense({ id: "lic-1", tenantId: "tenant-1", installationId: "inst-1", moduleId: "ai.agents", source: "paid_addon", now: NOW });
}

describe("ModuleLicense lifecycle", () => {
  it("createLicense nasce draft, nunca ativa módulo real", () => {
    const license = baseLicense();
    expect(license.status).toBe("draft");
  });

  it("activateLicense -> suspendLicense -> activateLicense (recuperação) funciona", () => {
    let license = activateLicense(baseLicense());
    expect(license.status).toBe("active");
    license = suspendLicense(license);
    expect(license.status).toBe("suspended");
    license = activateLicense(license);
    expect(license.status).toBe("active");
  });

  it("startLicenseGracePeriod grava gracePeriodEndsAt", () => {
    const active = activateLicense(baseLicense());
    const grace = startLicenseGracePeriod(active, "2026-02-01T00:00:00.000Z");
    expect(grace.status).toBe("grace_period");
    expect(grace.gracePeriodEndsAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("expireLicense/cancelLicense/revokeLicense gravam endsAt e nunca removem dado (só mudam status)", () => {
    const active = activateLicense(baseLicense());
    const expired = expireLicense(active, "2026-03-01T00:00:00.000Z");
    expect(expired.status).toBe("expired");
    expect(expired.endsAt).toBe("2026-03-01T00:00:00.000Z");

    const cancelled = cancelLicense(activateLicense(baseLicense()));
    expect(cancelled.status).toBe("cancelled");

    const revoked = revokeLicense(activateLicense(baseLicense()));
    expect(revoked.status).toBe("revoked");
  });

  it("renewLicense volta pra active a partir de expired", () => {
    const expired = expireLicense(activateLicense(baseLicense()));
    const renewed = renewLicense(expired, "2027-01-01T00:00:00.000Z");
    expect(renewed.status).toBe("active");
    expect(renewed.endsAt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("transição inválida (cancelled -> active) lança MarketplaceInvalidTransitionError", () => {
    const cancelled = cancelLicense(activateLicense(baseLicense()));
    expect(() => activateLicense(cancelled)).toThrow(MarketplaceInvalidTransitionError);
  });

  it("changeLicenseVersion só troca a versão, nunca o status", () => {
    const active = activateLicense(baseLicense());
    const upgraded = changeLicenseVersion(active, "2.0.0");
    expect(upgraded.version).toBe("2.0.0");
    expect(upgraded.status).toBe("active");
  });

  it("convertTrialToLicense produz licença active com source trial, nunca cobra", () => {
    const trial: ModuleTrial = {
      id: "trial-1",
      tenantId: "tenant-1",
      installationId: "inst-1",
      moduleId: "channel.whatsapp",
      status: "active",
      startsAt: NOW,
      endsAt: "2026-01-15T00:00:00.000Z",
      createdAt: NOW,
      updatedAt: NOW,
    };
    const license = convertTrialToLicense(trial, "lic-from-trial", NOW);
    expect(license.status).toBe("active");
    expect(license.source).toBe("trial");
    expect(license.trialEndsAt).toBe(trial.endsAt);
  });
});

describe("ModuleTrial lifecycle", () => {
  it("createTrial recusa módulo sem trialAvailable", () => {
    const mktModule = resolveMarketplaceModule("core.crm")!; // trialAvailable: false
    expect(() =>
      createTrial({ id: "t1", tenantId: "tenant-1", installationId: "inst-1", moduleId: "core.crm", startsAt: NOW, durationDays: 14 }, mktModule),
    ).toThrow(TrialNotAvailableError);
  });

  it("createTrial recusa módulo retired", () => {
    const mktModule = resolveMarketplaceModule("channel.whatsapp")!;
    const retiredModule = { ...mktModule, status: "retired" as const };
    expect(() =>
      createTrial({ id: "t1", tenantId: "tenant-1", installationId: "inst-1", moduleId: "channel.whatsapp", startsAt: NOW, durationDays: 14 }, retiredModule),
    ).toThrow(TrialNotAvailableError);
  });

  it("createTrial calcula endsAt a partir de durationDays", () => {
    const mktModule = resolveMarketplaceModule("channel.whatsapp")!;
    const trial = createTrial({ id: "t1", tenantId: "tenant-1", installationId: "inst-1", moduleId: "channel.whatsapp", startsAt: NOW, durationDays: 14 }, mktModule);
    expect(trial.endsAt).toBe("2026-01-15T00:00:00.000Z");
    expect(trial.status).toBe("scheduled");
  });

  it("startTrial -> expireTrial -> não pode reabrir (terminal)", () => {
    const mktModule = resolveMarketplaceModule("channel.whatsapp")!;
    let trial = createTrial({ id: "t1", tenantId: "tenant-1", installationId: "inst-1", moduleId: "channel.whatsapp", startsAt: NOW, durationDays: 14 }, mktModule);
    trial = startTrial(trial, NOW);
    expect(trial.status).toBe("active");
    trial = expireTrial(trial, "2026-01-15T00:00:00.000Z");
    expect(trial.status).toBe("expired");
    expect(() => startTrial(trial, NOW)).toThrow(MarketplaceInvalidTransitionError);
  });

  it("convertTrial grava convertedLicenseId e não pode converter de novo", () => {
    const mktModule = resolveMarketplaceModule("channel.whatsapp")!;
    let trial = startTrial(createTrial({ id: "t1", tenantId: "tenant-1", installationId: "inst-1", moduleId: "channel.whatsapp", startsAt: NOW, durationDays: 14 }, mktModule), NOW);
    trial = convertTrial(trial, "lic-1", NOW);
    expect(trial.status).toBe("converted");
    expect(trial.convertedLicenseId).toBe("lic-1");
    expect(() => convertTrial(trial, "lic-2", NOW)).toThrow(MarketplaceInvalidTransitionError);
  });

  it("cancelTrial funciona a partir de scheduled ou active", () => {
    const mktModule = resolveMarketplaceModule("channel.whatsapp")!;
    const trial = createTrial({ id: "t1", tenantId: "tenant-1", installationId: "inst-1", moduleId: "channel.whatsapp", startsAt: NOW, durationDays: 14 }, mktModule);
    const cancelled = cancelTrial(trial, NOW);
    expect(cancelled.status).toBe("cancelled");
  });

  it("hasActiveTrial só considera scheduled/active do tenant+módulo certos", () => {
    const mktModule = resolveMarketplaceModule("channel.whatsapp")!;
    const trial = startTrial(createTrial({ id: "t1", tenantId: "tenant-1", installationId: "inst-1", moduleId: "channel.whatsapp", startsAt: NOW, durationDays: 14 }, mktModule), NOW);
    expect(hasActiveTrial([trial], "tenant-1", "channel.whatsapp")).toBe(true);
    expect(hasActiveTrial([trial], "tenant-2", "channel.whatsapp")).toBe(false);
    expect(hasActiveTrial([trial], "tenant-1", "ai.agents")).toBe(false);
  });
});
