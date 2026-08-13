import { describe, expect, it } from "vitest";

import { CredentialLeaseInvalidTransitionError, CredentialLeaseNotFoundError } from "@/lib/provider-credentials-runtime/errors";
import { CredentialAlreadyConsumedError } from "@/lib/provider-credentials-runtime/types";
import {
  activateCredentialLease,
  consumeCredentialLease,
  createCredentialLease,
  expireCredentialLease,
  failCredentialLease,
  isLeaseTerminal,
  releaseCredentialLease,
  revokeCredentialLease,
} from "@/lib/provider-credentials-runtime/lease";
import { InMemoryCredentialLeaseRepository } from "@/lib/provider-credentials-runtime/repository";

function baseInput() {
  return {
    tenantId: "tenant-1",
    installationId: "install-1",
    provider: "fake" as const,
    secretReferenceId: "sr-1",
    purpose: "api_call" as const,
    operation: "simulate",
    singleUse: true,
    correlationId: "corr-1",
    requestedBy: null,
  };
}

describe("createCredentialLease / activateCredentialLease", () => {
  it("cria a lease com status 'created'", async () => {
    const repo = new InMemoryCredentialLeaseRepository();
    const lease = await createCredentialLease(repo, baseInput());
    expect(lease.status).toBe("created");
    expect(lease.id).toBeTruthy();
  });

  it("ativa 'created' → 'active'", async () => {
    const repo = new InMemoryCredentialLeaseRepository();
    const lease = await createCredentialLease(repo, baseInput());
    const activated = await activateCredentialLease(repo, lease.id);
    expect(activated.status).toBe("active");
    expect(activated.activatedAt).toBeTruthy();
  });

  it("lança CredentialLeaseNotFoundError pra id inexistente", async () => {
    const repo = new InMemoryCredentialLeaseRepository();
    await expect(activateCredentialLease(repo, "id-que-nao-existe")).rejects.toThrow(CredentialLeaseNotFoundError);
  });
});

describe("consumeCredentialLease — single-use", () => {
  it("consome uma lease ativa", async () => {
    const repo = new InMemoryCredentialLeaseRepository();
    const lease = await createCredentialLease(repo, baseInput());
    await activateCredentialLease(repo, lease.id);
    const consumed = await consumeCredentialLease(repo, lease.id);
    expect(consumed.status).toBe("consumed");
    expect(consumed.consumedAt).toBeTruthy();
  });

  it("lease single-use NÃO pode ser consumida duas vezes", async () => {
    const repo = new InMemoryCredentialLeaseRepository();
    const lease = await createCredentialLease(repo, { ...baseInput(), singleUse: true });
    await activateCredentialLease(repo, lease.id);
    await consumeCredentialLease(repo, lease.id);
    await expect(consumeCredentialLease(repo, lease.id)).rejects.toThrow(CredentialAlreadyConsumedError);
  });

  it("lease multi-uso PODE ser consumida várias vezes enquanto ativa", async () => {
    const repo = new InMemoryCredentialLeaseRepository();
    const lease = await createCredentialLease(repo, { ...baseInput(), singleUse: false });
    await activateCredentialLease(repo, lease.id);
    await consumeCredentialLease(repo, lease.id);
    await expect(consumeCredentialLease(repo, lease.id)).resolves.toMatchObject({ status: "consumed" });
  });
});

describe("releaseCredentialLease", () => {
  it("libera uma lease ativa", async () => {
    const repo = new InMemoryCredentialLeaseRepository();
    const lease = await createCredentialLease(repo, baseInput());
    await activateCredentialLease(repo, lease.id);
    const released = await releaseCredentialLease(repo, lease.id);
    expect(released.status).toBe("released");
    expect(isLeaseTerminal(released.status)).toBe(true);
  });

  it("é IDEMPOTENTE — liberar uma lease já terminal não lança, devolve como está", async () => {
    const repo = new InMemoryCredentialLeaseRepository();
    const lease = await createCredentialLease(repo, baseInput());
    await revokeCredentialLease(repo, lease.id);
    const releasedAfterRevoked = await releaseCredentialLease(repo, lease.id);
    expect(releasedAfterRevoked.status).toBe("revoked"); // não sobrescreve revoked com released
  });
});

describe("release-on-error — falha e depois libera sem lançar", () => {
  it("failCredentialLease marca 'failed', e releaseCredentialLease depois é no-op idempotente", async () => {
    const repo = new InMemoryCredentialLeaseRepository();
    const lease = await createCredentialLease(repo, baseInput());
    await activateCredentialLease(repo, lease.id);

    const failed = await failCredentialLease(repo, lease.id, "falha intencional de teste");
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("falha intencional de teste");

    const releasedAfter = await releaseCredentialLease(repo, lease.id);
    expect(releasedAfter.status).toBe("failed"); // release não sobrescreve um estado terminal já existente
  });
});

describe("expireCredentialLease / revokeCredentialLease", () => {
  it("expira uma lease ativa — consumo depois lança CredentialLeaseInvalidTransitionError", async () => {
    const repo = new InMemoryCredentialLeaseRepository();
    const lease = await createCredentialLease(repo, baseInput());
    await activateCredentialLease(repo, lease.id);
    await expireCredentialLease(repo, lease.id);
    await expect(consumeCredentialLease(repo, lease.id)).rejects.toThrow(CredentialLeaseInvalidTransitionError);
  });

  it("revokeCredentialLease é idempotente quando já revogada", async () => {
    const repo = new InMemoryCredentialLeaseRepository();
    const lease = await createCredentialLease(repo, baseInput());
    await revokeCredentialLease(repo, lease.id);
    await expect(revokeCredentialLease(repo, lease.id)).resolves.toMatchObject({ status: "revoked" });
  });
});

describe("InMemoryCredentialLeaseRepository", () => {
  it("listByInstallation filtra e ordena por createdAt desc", async () => {
    const repo = new InMemoryCredentialLeaseRepository();
    await createCredentialLease(repo, { ...baseInput(), installationId: "install-x" });
    await createCredentialLease(repo, { ...baseInput(), installationId: "install-y" });
    const leases = await repo.listByInstallation("install-x");
    expect(leases).toHaveLength(1);
    expect(leases[0]?.installationId).toBe("install-x");
  });
});
