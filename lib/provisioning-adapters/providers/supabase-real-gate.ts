/**
 * Gate de execução real — `REAL_PROVISIONING_ENABLED`, default `false`.
 *
 * Lê `process.env` DIRETO, nunca via `lib/env.ts` — `lib/env.ts` valida (com
 * Zod) TODA env var crítica na hora do import e lança se faltar (mesmo
 * cuidado já documentado em `control-plane-persistence/services.ts` e
 * `provider-credentials-runtime/factory.ts`). O Real Supabase Adapter
 * precisa continuar funcionando em dry-run/CLI/teste sem `.env` nenhum — só
 * a leitura deste único booleano, isolada, evita acoplar esse caminho ao
 * grafo de import de `lib/env.ts`. O mesmo nome/semântica é espelhado em
 * `lib/env.ts` (`REAL_PROVISIONING_ENABLED`) só pra documentação/boot da
 * app — nunca importado por este módulo.
 */
import { RealProvisioningDisabledError, type ProvisioningProvider } from "../types";

export type SupabaseRealGateEnv = Record<string, string | undefined>;

export function isRealProvisioningEnabled(env: SupabaseRealGateEnv = process.env): boolean {
  return env.REAL_PROVISIONING_ENABLED === "true";
}

/** Lança `RealProvisioningDisabledError` se o gate estiver desligado (default). Nunca lança se ligado — só confere. */
export function assertRealProvisioningEnabled(
  provider: ProvisioningProvider,
  operation: string,
  env: SupabaseRealGateEnv = process.env,
): void {
  if (!isRealProvisioningEnabled(env)) {
    throw new RealProvisioningDisabledError(provider, operation);
  }
}

export { RealProvisioningDisabledError };
