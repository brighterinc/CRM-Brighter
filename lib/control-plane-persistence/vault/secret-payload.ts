/**
 * `SecretPayloadRepository` — guarda o CIPHERTEXT (nunca plaintext) e o
 * ciclo de vida de VERSÃO de um segredo, numa tabela SEPARADA de
 * `control_plane_secret_references` (metadata pública — reference/type/
 * provider/status/version "atual"). Ver
 * `docs/vault-backend/architecture.md` §"Separação de conceitos".
 *
 * Cada `secretReferenceId` tem NO MÁXIMO uma versão `"active"` por vez
 * (invariante reforçado no banco por unique index parcial — ver migration —
 * e em `InMemorySecretPayloadRepository` por mutex por chave). Rotacionar
 * marca a versão atual `"superseded"` e escreve uma nova `"active"`;
 * revogar marca a versão atual `"revoked"` (terminal, sem próxima versão).
 *
 * `SecretCiphertextVersion` (com `ciphertext`) só deve circular dentro do
 * boundary de resolução (`PostgresPgcryptoRuntimeVaultProvider`) e da
 * escrita (`secret-value-service.ts`) — qualquer código que só precisa
 * LISTAR/EXIBIR histórico usa `SecretCiphertextVersionMetadata` (sem
 * `ciphertext`), devolvido por `listVersionMetadata`/`revokeActiveVersion`.
 */
import type { EncryptedSecretPayload } from "./encryption";
import { SecretVersionNotFoundError } from "./errors";

export type SecretCiphertextVersionStatus = "active" | "superseded" | "revoked";

export type SecretCiphertextVersion = {
  id: string;
  secretReferenceId: string;
  version: number;
  status: SecretCiphertextVersionStatus;
  ciphertext: Buffer;
  encryptionScheme: string;
  keyId: string;
  createdAt: string;
  supersededAt?: string;
  revokedAt?: string;
};

export type SecretCiphertextVersionMetadata = Omit<SecretCiphertextVersion, "ciphertext">;

function stripCiphertext(version: SecretCiphertextVersion): SecretCiphertextVersionMetadata {
  const { ciphertext: _ciphertext, ...metadata } = version;
  void _ciphertext;
  return metadata;
}

export interface SecretPayloadRepository {
  /** Supersede a versão ativa atual (se houver) e escreve a nova como ativa — atômico, seguro sob rotação concorrente. */
  writeVersion(secretReferenceId: string, payload: EncryptedSecretPayload): Promise<SecretCiphertextVersionMetadata>;
  /**
   * ÚNICO método que devolve o ciphertext de verdade — uso exclusivo de
   * `PostgresPgcryptoRuntimeVaultProvider.resolveSecret()`. Nunca chamado
   * por UI, CLI de listagem, ou audit/log.
   */
  getActiveCiphertext(secretReferenceId: string): Promise<SecretCiphertextVersion | null>;
  revokeActiveVersion(secretReferenceId: string): Promise<SecretCiphertextVersionMetadata | null>;
  listVersionMetadata(secretReferenceId: string): Promise<SecretCiphertextVersionMetadata[]>;
}

/**
 * Demonstração/teste — mesma doutrina das *Foundation* in-memory já
 * existentes: `Map` privado por instância, nunca singleton global.
 *
 * Concorrência: `writeVersion` serializa por `secretReferenceId` via um
 * mutex leve (fila de promises) — sem isso, duas chamadas concorrentes
 * (`Promise.all([rotate(), rotate()])`) poderiam ambas ler o mesmo "próximo
 * número de versão" antes de qualquer uma escrever, produzindo duas versões
 * `"active"` pro mesmo secret. O backend real (`fn_vault_write_secret_version`)
 * resolve o mesmo problema com `SELECT ... FOR UPDATE` na linha pai — este
 * mutex é o equivalente in-memory dessa serialização.
 */
export class InMemorySecretPayloadRepository implements SecretPayloadRepository {
  private readonly versionsByReference = new Map<string, SecretCiphertextVersion[]>();
  private readonly locks = new Map<string, Promise<unknown>>();

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(
      key,
      previous.then(() => gate),
    );
    await previous;
    try {
      return await fn();
    } finally {
      release!();
    }
  }

  async writeVersion(secretReferenceId: string, payload: EncryptedSecretPayload): Promise<SecretCiphertextVersionMetadata> {
    return this.withLock(secretReferenceId, async () => {
      const existing = this.versionsByReference.get(secretReferenceId) ?? [];
      const now = new Date().toISOString();

      const superseded = existing.map((v) => (v.status === "active" ? { ...v, status: "superseded" as const, supersededAt: now } : v));

      const nextVersion = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;
      const created: SecretCiphertextVersion = {
        id: crypto.randomUUID(),
        secretReferenceId,
        version: nextVersion,
        status: "active",
        ciphertext: payload.ciphertext,
        encryptionScheme: payload.encryptionScheme,
        keyId: payload.keyId,
        createdAt: now,
      };

      this.versionsByReference.set(secretReferenceId, [...superseded, created]);
      return stripCiphertext(created);
    });
  }

  async getActiveCiphertext(secretReferenceId: string): Promise<SecretCiphertextVersion | null> {
    const versions = this.versionsByReference.get(secretReferenceId) ?? [];
    return versions.find((v) => v.status === "active") ?? null;
  }

  async revokeActiveVersion(secretReferenceId: string): Promise<SecretCiphertextVersionMetadata | null> {
    return this.withLock(secretReferenceId, async () => {
      const versions = this.versionsByReference.get(secretReferenceId) ?? [];
      const activeIndex = versions.findIndex((v) => v.status === "active");
      if (activeIndex === -1) return null;

      const now = new Date().toISOString();
      const revoked: SecretCiphertextVersion = { ...versions[activeIndex]!, status: "revoked", revokedAt: now };
      const next = [...versions];
      next[activeIndex] = revoked;
      this.versionsByReference.set(secretReferenceId, next);
      return stripCiphertext(revoked);
    });
  }

  async listVersionMetadata(secretReferenceId: string): Promise<SecretCiphertextVersionMetadata[]> {
    const versions = this.versionsByReference.get(secretReferenceId) ?? [];
    return versions.map(stripCiphertext).sort((a, b) => b.version - a.version);
  }
}

export { SecretVersionNotFoundError };
