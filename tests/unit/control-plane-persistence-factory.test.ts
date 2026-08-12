import { describe, expect, it } from "vitest";

import { createControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";
import { InMemoryCredentialsVault } from "@/lib/control-plane-persistence/vault/in-memory";

describe("createControlPlaneRepositories", () => {
  it("mode 'memory' resolve sem tocar lib/supabase/admin — nunca lança por env ausente", async () => {
    const repos = await createControlPlaneRepositories("memory");
    expect(repos.mode).toBe("memory");
    expect(repos.vault).toBeInstanceOf(InMemoryCredentialsVault);
  });

  it("cada chamada em modo 'memory' devolve repositories novos (nunca singleton compartilhado)", async () => {
    const reposA = await createControlPlaneRepositories("memory");
    const reposB = await createControlPlaneRepositories("memory");
    const tenant = await reposA.tenants.create({
      clientName: "A",
      clientSlug: "empresa-a",
      domain: "a.invalid",
      plan: "lite",
      requestedModules: [],
      enabledModules: [],
      branding: { appName: "A" },
      commercialStatus: "onboarding",
      technicalStatus: "configuration_pending",
    });
    expect(await reposB.tenants.findById(tenant.id)).toBeNull();
  });

  it("mode 'database' devolve mode correto (construção não dispara chamada de rede)", async () => {
    const repos = await createControlPlaneRepositories("database");
    expect(repos.mode).toBe("database");
  });
});
