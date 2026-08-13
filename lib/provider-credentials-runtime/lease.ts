/**
 * Ciclo de vida da `CredentialLease` — controla POR QUANTO TEMPO/QUANTAS
 * VEZES uma credencial resolvida pode ser usada, independente do
 * `ResolvedCredential` em si (defesa em profundidade: mesmo se alguém
 * chamar `.use()` do wrapper diretamente sem passar pelo runtime, a lease
 * ainda impõe o estado — ver `runtime.ts`).
 *
 * Transições válidas (fail-closed — transição fora da tabela lança
 * `CredentialLeaseInvalidTransitionError`):
 *
 *   created → active | expired | revoked | failed
 *   active  → consumed | released | expired | revoked | failed
 *   consumed → released | expired | revoked | failed (e `consumed → consumed`
 *              só se `singleUse: false` — lease multi-uso pode ser
 *              consumida de novo enquanto não for liberada/expirada/revogada)
 *   released | expired | revoked | failed → terminal (sem saída)
 *
 * `releaseCredentialLease`/`revokeCredentialLease`/`failCredentialLease` são
 * IDEMPOTENTES quando a lease já está num estado terminal — devolvem a
 * lease sem mudar nada, nunca lançam. Isso é deliberado: o `finally` de
 * `withProviderCredential` sempre chama `releaseCredentialLease`,
 * independente de já ter sido liberada por outro caminho (ex.: falha antes
 * do fim) — nunca pode lançar e mascarar o erro original do callback.
 */
import { CredentialLeaseInvalidTransitionError, CredentialLeaseNotFoundError } from "./errors";
import type { CredentialLeaseRepository, CreateCredentialLeaseInput } from "./repository";
import { CredentialAlreadyConsumedError, type CredentialLease, type CredentialLeaseStatus } from "./types";

const TERMINAL_STATUSES: ReadonlySet<CredentialLeaseStatus> = new Set(["released", "expired", "revoked", "failed"]);

const ALLOWED_TRANSITIONS: Record<CredentialLeaseStatus, CredentialLeaseStatus[]> = {
  created: ["active", "expired", "revoked", "failed"],
  active: ["consumed", "released", "expired", "revoked", "failed"],
  consumed: ["released", "expired", "revoked", "failed"],
  released: [],
  expired: [],
  revoked: [],
  failed: [],
};

export async function createCredentialLease(repo: CredentialLeaseRepository, input: CreateCredentialLeaseInput): Promise<CredentialLease> {
  return repo.create(input);
}

export async function activateCredentialLease(repo: CredentialLeaseRepository, leaseId: string): Promise<CredentialLease> {
  const lease = await repo.find(leaseId);
  if (!lease) throw new CredentialLeaseNotFoundError(leaseId);
  if (!ALLOWED_TRANSITIONS[lease.status].includes("active")) {
    throw new CredentialLeaseInvalidTransitionError(leaseId, lease.status, "active");
  }
  return repo.update(leaseId, { status: "active", activatedAt: new Date().toISOString() });
}

/**
 * Marca a lease como consumida. Lease single-use só pode ser consumida
 * UMA vez — segunda chamada lança `CredentialAlreadyConsumedError` (mesmo
 * erro que `ResolvedCredential.use()` lança na segunda chamada, por
 * consistência). Lease multi-uso pode ser consumida repetidamente enquanto
 * não for liberada/expirada/revogada.
 */
export async function consumeCredentialLease(repo: CredentialLeaseRepository, leaseId: string): Promise<CredentialLease> {
  const lease = await repo.find(leaseId);
  if (!lease) throw new CredentialLeaseNotFoundError(leaseId);

  if (lease.status === "consumed") {
    if (lease.singleUse) throw new CredentialAlreadyConsumedError(leaseId);
    return repo.update(leaseId, { consumedAt: new Date().toISOString() });
  }

  if (!ALLOWED_TRANSITIONS[lease.status].includes("consumed")) {
    throw new CredentialLeaseInvalidTransitionError(leaseId, lease.status, "consumed");
  }
  return repo.update(leaseId, { status: "consumed", consumedAt: new Date().toISOString() });
}

export async function releaseCredentialLease(repo: CredentialLeaseRepository, leaseId: string): Promise<CredentialLease> {
  const lease = await repo.find(leaseId);
  if (!lease) throw new CredentialLeaseNotFoundError(leaseId);
  if (TERMINAL_STATUSES.has(lease.status)) return lease;
  return repo.update(leaseId, { status: "released", releasedAt: new Date().toISOString() });
}

export async function expireCredentialLease(repo: CredentialLeaseRepository, leaseId: string): Promise<CredentialLease> {
  const lease = await repo.find(leaseId);
  if (!lease) throw new CredentialLeaseNotFoundError(leaseId);
  if (TERMINAL_STATUSES.has(lease.status)) return lease;
  return repo.update(leaseId, { status: "expired", expiresAt: lease.expiresAt ?? new Date().toISOString() });
}

export async function revokeCredentialLease(repo: CredentialLeaseRepository, leaseId: string): Promise<CredentialLease> {
  const lease = await repo.find(leaseId);
  if (!lease) throw new CredentialLeaseNotFoundError(leaseId);
  if (lease.status === "revoked") return lease;
  return repo.update(leaseId, { status: "revoked", revokedAt: new Date().toISOString() });
}

export async function failCredentialLease(repo: CredentialLeaseRepository, leaseId: string, failureReason: string): Promise<CredentialLease> {
  const lease = await repo.find(leaseId);
  if (!lease) throw new CredentialLeaseNotFoundError(leaseId);
  if (TERMINAL_STATUSES.has(lease.status)) return lease;
  return repo.update(leaseId, { status: "failed", failureReason });
}

export function isLeaseTerminal(status: CredentialLeaseStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
