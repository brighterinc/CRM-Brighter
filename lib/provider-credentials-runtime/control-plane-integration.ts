/**
 * View model de leitura pra Control Plane — cruza `PersistedProviderConnection`
 * + `SecretReferenceMetadata` (já persistidos, `lib/control-plane-persistence`)
 * com o `RuntimeVaultProviderRegistry` desta camada, pra responder "esta
 * instalação está pronta pra resolver credencial deste provider?" sem
 * NUNCA tocar/expor um valor de segredo — só metadata e status. Consumido
 * pela admin UI (`app/app/settings/control-plane/credentials-runtime`) e
 * pelo `summary.ts`.
 */
import type { PersistedProviderConnection, SecretReferenceMetadata, VaultProvider } from "@/lib/control-plane-persistence/types";
import type { ProvisioningProvider } from "@/lib/provisioning-adapters/types";

import type { RuntimeVaultProviderRegistry } from "./registry";

export type ProviderCredentialReadiness = {
  installationId: string;
  provider: ProvisioningProvider;
  connectionStatus: PersistedProviderConnection["status"] | "missing";
  secretReferenceId: string | null;
  secretReferenceStatus: SecretReferenceMetadata["status"] | "missing";
  vaultProvider: VaultProvider | null;
  runtimeVaultProviderAvailable: boolean;
  ready: boolean;
  blockers: string[];
  warnings: string[];
};

export function evaluateProviderCredentialReadiness(params: {
  installationId: string;
  provider: ProvisioningProvider;
  connection: PersistedProviderConnection | null;
  secretReference: SecretReferenceMetadata | null;
  vaultProviderRegistry: RuntimeVaultProviderRegistry;
}): ProviderCredentialReadiness {
  const { installationId, provider, connection, secretReference, vaultProviderRegistry } = params;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!connection) {
    blockers.push("provider_connection_missing");
  } else if (connection.status !== "available") {
    blockers.push(`provider_connection_${connection.status}`);
  }

  if (!connection?.secretReferenceId) {
    warnings.push("connection_without_secret_reference");
  }

  if (!secretReference) {
    blockers.push("secret_reference_missing");
  } else if (secretReference.status !== "active") {
    blockers.push(`secret_reference_${secretReference.status}`);
  }

  let runtimeVaultProviderAvailable = false;
  if (secretReference) {
    try {
      vaultProviderRegistry.resolveProviderForVault(secretReference.vaultProvider);
      runtimeVaultProviderAvailable = true;
    } catch {
      blockers.push(`runtime_vault_provider_unavailable:${secretReference.vaultProvider}`);
    }
  }

  return {
    installationId,
    provider,
    connectionStatus: connection?.status ?? "missing",
    secretReferenceId: secretReference?.id ?? connection?.secretReferenceId ?? null,
    secretReferenceStatus: secretReference?.status ?? "missing",
    vaultProvider: secretReference?.vaultProvider ?? null,
    runtimeVaultProviderAvailable,
    ready: blockers.length === 0,
    blockers,
    warnings,
  };
}

export function buildInstallationCredentialReadiness(params: {
  installationId: string;
  connections: PersistedProviderConnection[];
  secretReferencesById: Map<string, SecretReferenceMetadata>;
  vaultProviderRegistry: RuntimeVaultProviderRegistry;
}): ProviderCredentialReadiness[] {
  const { installationId, connections, secretReferencesById, vaultProviderRegistry } = params;
  return connections
    .filter((c) => c.installationId === installationId)
    .map((connection) =>
      evaluateProviderCredentialReadiness({
        installationId,
        provider: connection.provider,
        connection,
        secretReference: connection.secretReferenceId ? (secretReferencesById.get(connection.secretReferenceId) ?? null) : null,
        vaultProviderRegistry,
      }),
    );
}

export type ProviderCredentialReadinessOverview = {
  total: number;
  ready: number;
  missing: number;
  blocked: number;
};

export function summarizeProviderCredentialReadiness(readiness: ProviderCredentialReadiness[]): ProviderCredentialReadinessOverview {
  return {
    total: readiness.length,
    ready: readiness.filter((r) => r.ready).length,
    missing: readiness.filter((r) => r.secretReferenceStatus === "missing" || r.connectionStatus === "missing").length,
    blocked: readiness.filter((r) => !r.ready && r.secretReferenceStatus !== "missing" && r.connectionStatus !== "missing").length,
  };
}
