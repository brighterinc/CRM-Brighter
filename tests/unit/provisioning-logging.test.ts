import { describe, expect, it } from "vitest";

import { createProvisioningLogEntry } from "@/lib/provisioning";
import type { ProvisioningExecutionContext } from "@/lib/provisioning";

const CTX: ProvisioningExecutionContext = {
  runId: "run-1",
  tenantId: "tenant-1",
  tenantSlug: "empresa-exemplo",
  plan: "lite",
  stepId: "create_supabase_project",
};

describe("createProvisioningLogEntry — sanitização", () => {
  it("monta os campos estruturados corretamente", () => {
    const entry = createProvisioningLogEntry({
      ctx: CTX,
      level: "info",
      event: "test.event",
      message: "mensagem de teste",
    });

    expect(entry.runId).toBe("run-1");
    expect(entry.tenantId).toBe("tenant-1");
    expect(entry.stepId).toBe("create_supabase_project");
    expect(entry.level).toBe("info");
    expect(entry.event).toBe("test.event");
    expect(entry.message).toBe("mensagem de teste");
    expect(() => new Date(entry.timestamp).toISOString()).not.toThrow();
  });

  it("remove recursivamente chave sensível do metadata, mesmo em objeto 'sujo'", () => {
    // Metadata deliberadamente "suja" — chaves fora de qualquer tipo formal,
    // simulando um objeto externo malformado em runtime.
    const dirtyMetadata = {
      projectRef: "abcxyz",
      password: "super-secret",
      apiKey: "sk-live-123",
      serviceRoleKey: "eyabc.def.ghi",
      databaseUrl: "postgres://user:pass@host/db",
      nested: {
        token: "nested-token-value",
        ok: "valor normal",
      },
      list: [{ sshKey: "-----BEGIN KEY-----" }, { safe: "valor" }],
    };

    const entry = createProvisioningLogEntry({
      ctx: CTX,
      level: "error",
      event: "test.dirty",
      message: "teste com metadata suja",
      metadata: dirtyMetadata,
    });

    const serialized = JSON.stringify(entry.metadata);
    expect(serialized).not.toMatch(/super-secret/);
    expect(serialized).not.toMatch(/sk-live-123/);
    expect(serialized).not.toMatch(/eyabc\.def\.ghi/);
    expect(serialized).not.toMatch(/postgres:\/\/user/);
    expect(serialized).not.toMatch(/nested-token-value/);
    expect(serialized).not.toMatch(/BEGIN KEY/);
    expect(entry.metadata.projectRef).toBe("abcxyz");
    expect((entry.metadata.nested as Record<string, unknown>).ok).toBe("valor normal");
  });
});
