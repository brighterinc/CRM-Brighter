/**
 * Sanitização específica do runtime de credenciais — camada ADICIONAL a
 * `sanitizeDeep`/`findSensitiveKeyPaths` (`@/lib/tenants/export`, fonte única
 * reusada por todo domínio — nunca duplicar o regex aqui). Reusa o mesmo
 * padrão de chave sensível E soma verificação estrutural: um
 * `ResolvedCredential` embutido em qualquer profundidade (mesmo debaixo de
 * uma chave de nome inocente, que um denylist só-por-nome não pegaria) —
 * ver `containsResolvedCredential` em `types.ts`.
 *
 * Filosofia igual a `assertSafePersistencePayload`
 * (`lib/control-plane-persistence/safe-persistence.ts`): NUNCA mascara
 * silenciosamente — lança com os dot-paths ofensivos. Mascarar aqui
 * esconderia exatamente o bug que deixou um segredo chegar tão longe.
 */
import { findSensitiveKeyPaths, sanitizeDeep } from "@/lib/tenants/export";

import { CredentialLeakDetectedError } from "./errors";
import { containsResolvedCredential } from "./types";

/** Chaves extras específicas deste runtime, além do denylist genérico de `sanitizeDeep`. */
const RUNTIME_EXTRA_SENSITIVE_KEY_PATTERN = /vault[_-]?key$|leasevalue|resolvedvalue|plaintext/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findRuntimeExtraSensitivePaths(value: unknown, basePath = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findRuntimeExtraSensitivePaths(item, basePath ? `${basePath}.${index}` : String(index)));
  }
  if (isPlainObject(value)) {
    const found: string[] = [];
    for (const [key, v] of Object.entries(value)) {
      const path = basePath ? `${basePath}.${key}` : key;
      if (RUNTIME_EXTRA_SENSITIVE_KEY_PATTERN.test(key)) {
        found.push(path);
        continue;
      }
      found.push(...findRuntimeExtraSensitivePaths(v, path));
    }
    return found;
  }
  return [];
}

/**
 * Falha fechado se `payload` contém qualquer chave sensível (denylist geral
 * + denylist extra deste runtime) OU um `ResolvedCredential` embutido em
 * qualquer profundidade. Chamar em TODA fronteira de saída desta camada:
 * summary, log, audit metadata, resposta de API/CLI/UI.
 */
export function assertNoCredentialLeak(payload: unknown, context: string): void {
  const offending = new Set<string>([...findSensitiveKeyPaths(payload), ...findRuntimeExtraSensitivePaths(payload)]);
  if (containsResolvedCredential(payload)) offending.add("<ResolvedCredential embutido>");
  if (offending.size > 0) throw new CredentialLeakDetectedError(context, Array.from(offending).sort());
}

/**
 * Versão mais restrita — só a checagem ESTRUTURAL (`ResolvedCredential`
 * embutido em qualquer profundidade), sem o denylist de nome de chave.
 * Existe porque tipos legítimos desta camada usam nomes de campo como
 * `secretReferenceId`/`secret_type` (a própria doutrina do request/lease —
 * ver `types.ts`) que CASAM o denylist genérico (`SENSITIVE_KEY_PATTERN`
 * casa qualquer chave que CONTENHA "secret", não só valor de segredo) sem
 * jamais carregar um valor de verdade — o tipo (`ProviderCredentialReadiness`,
 * `SimulationScenarioResult`, `RuntimeVaultProviderHealth`) já garante isso
 * em compile-time. Use esta versão só pra objetos JÁ TIPADOS e conhecidos
 * como seguros por construção (ex.: `summary.ts`); use
 * `assertNoCredentialLeak` (com denylist) em fronteiras que recebem
 * `Record<string, unknown>` solto (ex.: metadata de audit event).
 */
export function assertNoEmbeddedCredential(payload: unknown, context: string): void {
  if (containsResolvedCredential(payload)) {
    throw new CredentialLeakDetectedError(context, ["<ResolvedCredential embutido>"]);
  }
}

/**
 * Versão "não lança" — remove recursivamente as mesmas chaves sensíveis
 * (denylist geral + extra deste runtime). Usada só onde mascarar em vez de
 * recusar é aceitável (ex.: preview de log de debug já sabidamente sujo).
 * Prefira `assertNoCredentialLeak` em toda fronteira de escrita/saída formal.
 */
export function sanitizeCredentialRuntimePayload(value: unknown): unknown {
  const sanitized = sanitizeDeep(value);
  return stripRuntimeExtraKeys(sanitized);
}

function stripRuntimeExtraKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripRuntimeExtraKeys);
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (RUNTIME_EXTRA_SENSITIVE_KEY_PATTERN.test(key)) continue;
      result[key] = stripRuntimeExtraKeys(v);
    }
    return result;
  }
  return value;
}
