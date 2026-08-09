/**
 * Repositório abstrato da Provisioning Adapters Foundation — v1.
 *
 * `ProvisioningAdapterRepository` é a interface; `InMemoryProvisioningAdapterRepository`
 * é a única implementação desta Foundation — DEMONSTRAÇÃO/TESTE, não
 * produção: sem tabela, sem migration, sem Supabase real (mesma doutrina de
 * `InMemoryInstallationRepository`/`InMemoryTenantRepository`). Cada
 * instância começa vazia — nunca singleton global mutável da aplicação.
 */
import type { ProvisioningAdapterRequest, ProvisioningAdapterResult } from "./types";

export interface ProvisioningAdapterRepository {
  /** Chave = `request.idempotencyKey` — `ProvisioningAdapterRequest` não tem id próprio. */
  saveRequest(request: ProvisioningAdapterRequest): Promise<void>;
  findRequest(idempotencyKey: string): Promise<ProvisioningAdapterRequest | null>;
  listRequests(): Promise<ProvisioningAdapterRequest[]>;
  /** `idempotencyKey` do request que originou este resultado — liga os dois pra `findByIdempotencyKey`. */
  saveResult(result: ProvisioningAdapterResult, idempotencyKey: string): Promise<void>;
  findResult(requestId: string): Promise<ProvisioningAdapterResult | null>;
  listResults(): Promise<ProvisioningAdapterResult[]>;
  findByIdempotencyKey(idempotencyKey: string): Promise<ProvisioningAdapterResult | null>;
}

export class InMemoryProvisioningAdapterRepository implements ProvisioningAdapterRepository {
  private readonly requestsByIdempotencyKey = new Map<string, ProvisioningAdapterRequest>();
  private readonly resultsByRequestId = new Map<string, ProvisioningAdapterResult>();
  private readonly resultByIdempotencyKey = new Map<string, ProvisioningAdapterResult>();

  async saveRequest(request: ProvisioningAdapterRequest): Promise<void> {
    this.requestsByIdempotencyKey.set(request.idempotencyKey, request);
  }

  async findRequest(idempotencyKey: string): Promise<ProvisioningAdapterRequest | null> {
    return this.requestsByIdempotencyKey.get(idempotencyKey) ?? null;
  }

  async listRequests(): Promise<ProvisioningAdapterRequest[]> {
    return [...this.requestsByIdempotencyKey.values()];
  }

  async saveResult(result: ProvisioningAdapterResult, idempotencyKey: string): Promise<void> {
    this.resultsByRequestId.set(result.requestId, result);
    this.resultByIdempotencyKey.set(idempotencyKey, result);
  }

  async findResult(requestId: string): Promise<ProvisioningAdapterResult | null> {
    return this.resultsByRequestId.get(requestId) ?? null;
  }

  async listResults(): Promise<ProvisioningAdapterResult[]> {
    return [...this.resultsByRequestId.values()];
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<ProvisioningAdapterResult | null> {
    return this.resultByIdempotencyKey.get(idempotencyKey) ?? null;
  }
}
