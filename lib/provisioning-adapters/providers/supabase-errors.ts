/**
 * Erros estruturados do Real Supabase Adapter — mesmo padrão flat do resto
 * do repo (`extends Error` direto, `this.name` em `snake_case` via classe,
 * campos estruturados `public readonly`, ver
 * `provider-credentials-runtime/errors.ts`). NENHUM erro aqui carrega
 * `Authorization`/token/body bruto — só status HTTP, código sanitizado e
 * request id.
 *
 * Erros de credencial (`ProviderCredentialAccessDeniedError`,
 * `SecretResolutionFailedError`, …) são de `provider-credentials-runtime` e
 * NUNCA duplicados aqui — o adapter deixa eles propagarem direto quando a
 * falha é na resolução da credencial, não na chamada HTTP em si.
 */

export type SupabaseApiErrorContext = {
  requestId: string;
  correlationId: string;
  /** Corpo de erro já sanitizado (`sanitizeDeep`) — nunca segredo. */
  details?: Record<string, unknown>;
};

export class SupabaseRequestInvalidError extends Error {
  constructor(public readonly errors: string[]) {
    super(`supabase_request_invalid: ${errors.join("; ")}`);
    this.name = "SupabaseRequestInvalidError";
  }
}

/**
 * Lançado quando o gate está ligado mas a operação não tem execução real
 * IMPLEMENTADA nesta etapa (`classification !== "real_supported"` —
 * `dry_run_only`/`planned`). Distinto de `RealProvisioningDisabledError`
 * (gate desligado): este erro dispara mesmo com o gate ligado, porque é uma
 * fronteira de escopo desta etapa, não uma política de segurança do gate.
 */
export class SupabaseOperationNotRealSupportedError extends Error {
  constructor(
    public readonly operation: string,
    public readonly classification: string,
  ) {
    super(
      `supabase_operation_not_real_supported: "${operation}" está classificada como "${classification}" nesta etapa — sem execução real implementada`,
    );
    this.name = "SupabaseOperationNotRealSupportedError";
  }
}

export class SupabaseCredentialInvalidError extends Error {
  constructor(public readonly context: SupabaseApiErrorContext) {
    super(`supabase_credential_invalid: token de Management API rejeitado (401) — requestId=${context.requestId}`);
    this.name = "SupabaseCredentialInvalidError";
  }
}

export class SupabaseAccessDeniedError extends Error {
  constructor(public readonly context: SupabaseApiErrorContext) {
    super(`supabase_access_denied: acesso negado pela Management API (403) — requestId=${context.requestId}`);
    this.name = "SupabaseAccessDeniedError";
  }
}

export class SupabaseProjectNotFoundError extends Error {
  constructor(
    public readonly projectRef: string,
    public readonly context: SupabaseApiErrorContext,
  ) {
    super(`supabase_project_not_found: projeto "${projectRef}" não encontrado (404) — requestId=${context.requestId}`);
    this.name = "SupabaseProjectNotFoundError";
  }
}

export class SupabaseProjectConflictError extends Error {
  constructor(public readonly context: SupabaseApiErrorContext) {
    super(`supabase_project_conflict: conflito lógico reportado pela Management API (409) — requestId=${context.requestId}`);
    this.name = "SupabaseProjectConflictError";
  }
}

export class SupabaseRateLimitError extends Error {
  constructor(
    public readonly retryAfterSeconds: number | null,
    public readonly context: SupabaseApiErrorContext,
  ) {
    super(`supabase_rate_limit: 429 da Management API — requestId=${context.requestId}, retryAfterSeconds=${retryAfterSeconds ?? "desconhecido"}`);
    this.name = "SupabaseRateLimitError";
  }
}

export class SupabaseTimeoutError extends Error {
  constructor(
    public readonly timeoutMs: number,
    public readonly context: SupabaseApiErrorContext,
  ) {
    super(`supabase_timeout: chamada à Management API excedeu ${timeoutMs}ms — requestId=${context.requestId}`);
    this.name = "SupabaseTimeoutError";
  }
}

/** Fallback genérico — qualquer HTTP status não coberto pelos erros acima (inclui 5xx não mapeados e 400 de validação da API). */
export class SupabaseApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly context: SupabaseApiErrorContext,
  ) {
    super(`supabase_api_error: status ${status} — requestId=${context.requestId}`);
    this.name = "SupabaseApiError";
  }
}

/**
 * Mapeia um status HTTP + corpo (já sanitizado) da Management API pro erro
 * estruturado correspondente. Único ponto que decide essa tradução — nunca
 * duplicado em `supabase-client.ts`/`supabase-api.ts`.
 */
export function mapHttpStatusToSupabaseError(
  status: number,
  context: SupabaseApiErrorContext,
  extra?: { projectRef?: string; retryAfterSeconds?: number | null },
): Error {
  switch (status) {
    case 401:
      return new SupabaseCredentialInvalidError(context);
    case 403:
      return new SupabaseAccessDeniedError(context);
    case 404:
      return new SupabaseProjectNotFoundError(extra?.projectRef ?? "unknown", context);
    case 409:
      return new SupabaseProjectConflictError(context);
    case 429:
      return new SupabaseRateLimitError(extra?.retryAfterSeconds ?? null, context);
    default:
      return new SupabaseApiError(status, context);
  }
}
