/**
 * Política de retry do Real Supabase Adapter — só erros seguros/transitórios
 * (timeout, 429, subconjunto de 5xx). NUNCA retry em 400/401/403/404/409 —
 * erro lógico/validação/autorização não se resolve tentando de novo. Sem
 * loop infinito: `maxAttempts` limita.
 */
import { SupabaseApiError, SupabaseRateLimitError, SupabaseTimeoutError } from "./supabase-errors";

export type SupabaseRetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export const DEFAULT_SUPABASE_RETRY_POLICY: SupabaseRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
};

const RETRYABLE_5XX = new Set([502, 503, 504]);

export function isRetryableSupabaseError(error: unknown): boolean {
  if (error instanceof SupabaseTimeoutError) return true;
  if (error instanceof SupabaseRateLimitError) return true;
  if (error instanceof SupabaseApiError) return RETRYABLE_5XX.has(error.status);
  return false;
}

function backoffDelayMs(attempt: number, policy: SupabaseRetryPolicy): number {
  const exponential = policy.baseDelayMs * 2 ** attempt;
  const jitter = Math.random() * policy.baseDelayMs;
  return Math.min(exponential + jitter, policy.maxDelayMs);
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type SupabaseRetryOutcome<T> = { result: T; attempts: number };

export async function withSupabaseRetry<T>(
  fn: () => Promise<T>,
  policy: SupabaseRetryPolicy = DEFAULT_SUPABASE_RETRY_POLICY,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<SupabaseRetryOutcome<T>> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < policy.maxAttempts) {
    try {
      const result = await fn();
      return { result, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === policy.maxAttempts - 1;
      if (!isRetryableSupabaseError(error) || isLastAttempt) throw error;
      await sleep(backoffDelayMs(attempt, policy));
      attempt += 1;
    }
  }

  throw lastError;
}
