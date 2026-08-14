/**
 * Cliente mínimo e isolado da Supabase Management API — nenhum SDK oficial
 * pra essa API existe no projeto (`lib/supabase/*` são clients do
 * `@supabase/ssr` pro PRÓPRIO banco desta instalação, um domínio
 * completamente diferente: aqui é a API de gestão de projetos de terceiros).
 *
 * Toda chamada real tem: timeout via `AbortController`, request id +
 * correlation id nos headers, structured errors (`supabase-errors.ts`),
 * `fetchImpl` injetável (nunca chama `fetch` real em teste). NUNCA loga
 * `Authorization` nem body — o token só existe na pilha de chamada, nunca
 * fica em campo de instância nem em log/erro.
 */
import { randomUUID } from "node:crypto";

import { mapHttpStatusToSupabaseError, SupabaseTimeoutError, type SupabaseApiErrorContext } from "./supabase-errors";

export const SUPABASE_MANAGEMENT_API_BASE_URL = "https://api.supabase.com";
export const DEFAULT_SUPABASE_CLIENT_TIMEOUT_MS = 10_000;

export type SupabaseManagementClientConfig = {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type SupabaseManagementRequestOptions = {
  method: "GET" | "POST";
  /** Nunca persistido em campo de instância — só passa pelo header desta chamada. */
  token: string;
  body?: Record<string, unknown>;
  correlationId: string;
  /** Extra pra montar `SupabaseApiErrorContext` em erros 404 (`projectRef`) — nunca segredo. */
  errorExtra?: { projectRef?: string };
};

export type SupabaseManagementResponse<T = unknown> = {
  status: number;
  requestId: string;
  json: T;
};

export class SupabaseManagementClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: SupabaseManagementClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? SUPABASE_MANAGEMENT_API_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_SUPABASE_CLIENT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async request<T = unknown>(path: string, options: SupabaseManagementRequestOptions): Promise<SupabaseManagementResponse<T>> {
    const requestId = randomUUID();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const context: SupabaseApiErrorContext = { requestId, correlationId: options.correlationId };

    try {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method: options.method,
          headers: {
            Authorization: `Bearer ${options.token}`,
            "content-type": "application/json",
            "x-request-id": requestId,
            "x-correlation-id": options.correlationId,
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
      } catch (error) {
        // `DOMException` (o que `fetch`/`AbortController` de fato lançam em
        // abort) NÃO estende `Error` no runtime do Node — checar só
        // `instanceof Error` deixa passar o abort como erro genérico em vez
        // de virar `SupabaseTimeoutError`. Checa `.name` estruturalmente.
        if (error && typeof error === "object" && "name" in error && (error as { name: unknown }).name === "AbortError") {
          throw new SupabaseTimeoutError(this.timeoutMs, context);
        }
        throw error;
      }

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        const retryAfterHeader = response.headers.get("retry-after");
        throw mapHttpStatusToSupabaseError(response.status, context, {
          projectRef: options.errorExtra?.projectRef,
          retryAfterSeconds: retryAfterHeader ? Number(retryAfterHeader) : null,
        });
      }

      return { status: response.status, requestId, json: json as T };
    } finally {
      clearTimeout(timeout);
    }
  }
}
