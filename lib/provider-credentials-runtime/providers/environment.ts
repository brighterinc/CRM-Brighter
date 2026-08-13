/**
 * `EnvironmentRuntimeVaultProvider` — resolve valor de `process.env`, só
 * quando EXPLICITAMENTE habilitado (`enabled: true` no construtor — default
 * é `false`, fail-closed). Não é ligado a nenhum runtime real por padrão;
 * existe pra permitir testar o fluxo completo de resolução sem depender de
 * `InMemoryRuntimeVaultProvider` (ex.: simular "a credencial vem do ambiente
 * de deploy"), sem jamais tocar `.env` de verdade — testes usam
 * `process.env` sintético, setado e restaurado dentro do próprio teste.
 *
 * `vaultKey` de uma `SecretReferenceMetadata` resolvida por este provider é
 * interpretado como o NOME da env var a ler — nunca o valor. Suporta só
 * `vaultProvider: "database_placeholder"`: essa é a única entrada do
 * vocabulário fechado `VAULT_PROVIDERS` (CHECK-backed, sem migration nesta
 * fase) que já significa "referência real, backend ainda não implementado" —
 * ver `docs/control-plane-persistence/credentials-vault.md` — e é
 * exatamente o vaultProvider que `DatabaseSecretReferenceRepository` usa
 * hoje. `"environment"` NÃO é somado a `VAULT_PROVIDERS` porque isso exigiria
 * alterar o CHECK constraint da coluna via migration, proibido nesta etapa.
 *
 * Allowlist de prefixo (`allowedPrefixes`, default `["BRIGHTER_RUNTIME_"]`):
 * recusa resolver qualquer env var fora do prefixo configurado — nunca deixa
 * este provider virar um jeito de ler QUALQUER variável do processo host
 * (mesmo padrão fail-closed/allowlist de `lib/agent-engine/edge/egress.ts`).
 */
import { SecretResolutionFailedError } from "../errors";
import {
  ResolvedCredential,
  type ResolveSecretOptions,
  type RuntimeVaultProvider,
  type RuntimeVaultProviderHealth,
  type SecretReferenceMetadata,
  type VaultProvider,
} from "../types";

const DEFAULT_ALLOWED_PREFIXES = ["BRIGHTER_RUNTIME_"];

export type EnvironmentRuntimeVaultProviderOptions = {
  /** Default `false` — precisa ser ligado explicitamente (teste/runtime futuro). */
  enabled?: boolean;
  allowedPrefixes?: string[];
};

export class EnvironmentRuntimeVaultProvider implements RuntimeVaultProvider {
  readonly id = "environment" as const;

  private readonly enabled: boolean;
  private readonly allowedPrefixes: string[];

  constructor(options: EnvironmentRuntimeVaultProviderOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.allowedPrefixes = options.allowedPrefixes ?? DEFAULT_ALLOWED_PREFIXES;
  }

  supports(vaultProvider: VaultProvider): boolean {
    return vaultProvider === "database_placeholder";
  }

  private assertAllowedEnvVarName(name: string): void {
    if (!this.allowedPrefixes.some((prefix) => name.startsWith(prefix))) {
      throw new SecretResolutionFailedError(
        "vault_provider_unavailable",
        `env var "${name}" fora da allowlist de prefixo (${this.allowedPrefixes.join(", ")}) — recusado, fail-closed`,
      );
    }
  }

  async resolveSecret(reference: SecretReferenceMetadata, options: ResolveSecretOptions): Promise<ResolvedCredential> {
    if (!this.enabled) {
      throw new SecretResolutionFailedError(
        "vault_provider_unavailable",
        "EnvironmentRuntimeVaultProvider não está habilitado (enabled: false) — resolução de process.env desligada por padrão",
      );
    }
    const envVarName = reference.vaultKey;
    this.assertAllowedEnvVarName(envVarName);
    const value = process.env[envVarName];
    if (value === undefined || value === "") {
      throw new SecretResolutionFailedError("reference_not_found", `env var "${envVarName}" ausente ou vazia no processo atual`);
    }
    return new ResolvedCredential(
      value,
      {
        secretReferenceId: reference.id,
        provider: reference.provider,
        secretType: reference.type,
        vaultProvider: reference.vaultProvider,
        version: reference.version,
      },
      options.singleUse,
    );
  }

  async validateReference(reference: SecretReferenceMetadata): Promise<{ valid: boolean; errors: string[] }> {
    if (!this.enabled) return { valid: false, errors: ["EnvironmentRuntimeVaultProvider desabilitado"] };
    try {
      this.assertAllowedEnvVarName(reference.vaultKey);
    } catch {
      return { valid: false, errors: [`env var "${reference.vaultKey}" fora da allowlist de prefixo`] };
    }
    const present = typeof process.env[reference.vaultKey] === "string" && process.env[reference.vaultKey] !== "";
    return present ? { valid: true, errors: [] } : { valid: false, errors: [`env var "${reference.vaultKey}" ausente ou vazia`] };
  }

  async healthPreview(): Promise<RuntimeVaultProviderHealth> {
    return {
      id: this.id,
      available: this.enabled,
      message: this.enabled
        ? `Environment — habilitado, prefixos permitidos: ${this.allowedPrefixes.join(", ")}.`
        : "Environment — desabilitado (default seguro).",
    };
  }
}
