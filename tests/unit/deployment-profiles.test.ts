import { describe, expect, it } from "vitest";

import { DEPLOYMENT_PROFILES, getDeploymentProfile } from "@/lib/deployment/profiles";

describe("DEPLOYMENT_PROFILES — lite", () => {
  const profile = getDeploymentProfile("lite");

  it("não exige VPS/Docker/proxy", () => {
    expect(profile.vpsRequired).toBe(false);
    expect(profile.dockerRequired).toBe(false);
    expect(profile.proxyRequired).toBe(false);
  });

  it("target padrão é vercel; vps não é permitido", () => {
    expect(profile.defaultTarget).toBe("vercel");
    expect(profile.allowedTargets).toContain("vercel");
    expect(profile.allowedTargets).toContain("cloudflare");
    expect(profile.allowedTargets).not.toContain("vps");
  });

  it("proíbe redis e worker contínuos (rede de segurança declarativa)", () => {
    expect(profile.forbiddenInfra).toContain("redis");
    expect(profile.forbiddenInfra).toContain("worker");
  });
});

describe("DEPLOYMENT_PROFILES — pro", () => {
  const profile = getDeploymentProfile("pro");

  it("não exige VPS; permite vercel/cloudflare, não vps", () => {
    expect(profile.vpsRequired).toBe(false);
    expect(profile.defaultTarget).toBe("vercel");
    expect(profile.allowedTargets).not.toContain("vps");
  });

  it("não força worker contínuo na lista de infra obrigatória", () => {
    expect(profile.mandatoryInfra).not.toContain("worker");
  });
});

describe("DEPLOYMENT_PROFILES — dedicated", () => {
  const profile = getDeploymentProfile("dedicated");

  it("exige VPS, Docker e proxy; único target permitido é vps", () => {
    expect(profile.vpsRequired).toBe(true);
    expect(profile.dockerRequired).toBe(true);
    expect(profile.proxyRequired).toBe(true);
    expect(profile.allowedTargets).toEqual(["vps"]);
    expect(profile.defaultTarget).toBe("vps");
  });

  it("não proíbe nenhuma infra — é o plano mais permissivo", () => {
    expect(profile.forbiddenInfra).toEqual([]);
  });
});

describe("DEPLOYMENT_PROFILES — cobertura dos 3 planos", () => {
  it("tem exatamente uma entrada por DeploymentPlan do Module Engine", () => {
    expect(Object.keys(DEPLOYMENT_PROFILES).sort()).toEqual(["dedicated", "lite", "pro"]);
  });
});
