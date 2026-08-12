/**
 * Guarda fail-closed contra persistir segredo — a diferença de propósito pra
 * `sanitizeDeep` (`lib/tenants/export.ts`) é deliberada: `sanitizeDeep` serve
 * export/log, onde REMOVER a chave em silêncio é o comportamento certo (o
 * consumidor só queria o resto do objeto). Aqui a pergunta é outra — "isso
 * pode virar linha no banco?" — e mascarar em silêncio esconderia o bug que
 * fez o segredo chegar até aqui. `assertSafePersistencePayload` por isso
 * LANÇA em vez de sanear, com a lista exata de dot-paths ofendendo.
 *
 * Reusa o detector de `sanitizeDeep` (`findSensitiveKeyPaths`, mesma regex —
 * nunca duplicada) e soma `authorization|cookie|session`, que a lista de
 * `sanitizeDeep` não cobre (ela foi desenhada pra segredo de infraestrutura;
 * aqui cobrimos também segredo de sessão HTTP).
 */
import { findSensitiveKeyPaths } from "@/lib/tenants/export";

const EXTRA_SENSITIVE_KEY_PATTERN = /authorization|cookie|session/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findExtraSensitivePaths(value: unknown, basePath = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findExtraSensitivePaths(item, basePath ? `${basePath}.${index}` : String(index)));
  }
  if (isPlainObject(value)) {
    const found: string[] = [];
    for (const [key, v] of Object.entries(value)) {
      const path = basePath ? `${basePath}.${key}` : key;
      if (EXTRA_SENSITIVE_KEY_PATTERN.test(key)) {
        found.push(path);
        continue;
      }
      found.push(...findExtraSensitivePaths(v, path));
    }
    return found;
  }
  return [];
}

export class UnsafePersistencePayloadError extends Error {
  constructor(
    public readonly context: string,
    public readonly offendingPaths: string[],
  ) {
    super(
      `unsafe_persistence_payload: "${context}" contém campo(s) sensível(is) em [${offendingPaths.join(", ")}] — persistência recusada (fail-closed)`,
    );
    this.name = "UnsafePersistencePayloadError";
  }
}

/**
 * Recusa (lança `UnsafePersistencePayloadError`) qualquer payload com chave
 * sensível em qualquer profundidade — `password`, `token`, `apiKey`,
 * `secret`, `serviceRoleKey`, `privateKey`, `authorization`, `cookie`,
 * `session`, `refreshToken`, `accessToken`, `databaseUrl`,
 * `connectionString`, `sshKey` (case-insensitive, substring). `context` é o
 * nome do chamador (ex.: `"recordDeployment.manifestSnapshot"`) — aparece na
 * mensagem de erro pra debugging.
 */
export function assertSafePersistencePayload(payload: unknown, context: string): void {
  const offending = Array.from(new Set([...findSensitiveKeyPaths(payload), ...findExtraSensitivePaths(payload)])).sort();
  if (offending.length > 0) {
    throw new UnsafePersistencePayloadError(context, offending);
  }
}
