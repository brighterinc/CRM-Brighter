import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";
import {
  buildInstallationCredentialReadiness,
  summarizeProviderCredentialReadiness,
  type ProviderCredentialReadiness,
} from "@/lib/provider-credentials-runtime/control-plane-integration";
import { createDefaultRuntimeVaultProviderRegistry } from "@/lib/provider-credentials-runtime/providers";
import type { Installation } from "@/lib/control-plane/types";

export const dynamic = "force-dynamic";

/**
 * `/app/settings/control-plane/credentials-runtime` — visão READ-ONLY do
 * estado da Provider Credentials Runtime: quais vault providers estão
 * disponíveis e se cada instalação/provider tem credencial pronta pra
 * resolver. Só platform-admin (`requirePlatformAdmin()` — MFA AAL2 forçada).
 *
 * NUNCA mostra `vault_key`/env value/valor de segredo — só metadata/status.
 * Sem campo de input de credencial (fora do escopo desta etapa — ver
 * `docs/provider-credentials-runtime/overview.md`).
 */

const READY_VARIANT: Record<string, "neutral" | "info" | "error" | "warning" | "success"> = {
  true: "success",
  false: "error",
};

const HEALTH_VARIANT: Record<string, "neutral" | "info" | "error" | "warning" | "success"> = {
  true: "success",
  false: "warning",
};

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-4 text-center text-xs text-muted-foreground">
        {label}
      </td>
    </tr>
  );
}

export default async function ProviderCredentialsRuntimePage() {
  await requirePlatformAdmin();

  const repos = await createControlPlaneRepositories("database");
  const registry = createDefaultRuntimeVaultProviderRegistry();

  const [vaultProviderHealth, installations] = await Promise.all([registry.healthPreview(), repos.installations.list()]);

  const [connectionsByInstallation, secretRefsByInstallation] = await Promise.all([
    Promise.all(installations.map((i) => repos.providerConnections.listByInstallation(i.id))),
    Promise.all(installations.map((i) => repos.secretReferences.listByInstallation(i.id))),
  ]);

  const connections = connectionsByInstallation.flat();
  const secretReferencesById = new Map(secretRefsByInstallation.flat().map((s) => [s.id, s]));

  const readinessByInstallation: { installation: Installation; readiness: ProviderCredentialReadiness[] }[] = installations.map(
    (installation) => ({
      installation,
      readiness: buildInstallationCredentialReadiness({
        installationId: installation.id,
        connections,
        secretReferencesById,
        vaultProviderRegistry: registry,
      }),
    }),
  );

  const allReadiness = readinessByInstallation.flatMap((r) => r.readiness);
  const overview = summarizeProviderCredentialReadiness(allReadiness);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Provider Credentials Runtime</h1>
        <p className="text-sm text-muted-foreground">
          Leitura do estado de resolução de credencial por instalação/provider — nunca o valor do segredo. Vault providers
          reais ainda não implementados nesta fase (fundação).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ver também{" "}
          <Link href="/app/settings/control-plane/persistence" className="underline">
            Control Plane — Persistência
          </Link>
          .
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Resumo</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Conexões avaliadas</p>
            <p className="text-2xl font-semibold">{overview.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Prontas</p>
            <p className="text-2xl font-semibold">{overview.ready}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Faltando</p>
            <p className="text-2xl font-semibold">{overview.missing}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Bloqueadas</p>
            <p className="text-2xl font-semibold">{overview.blocked}</p>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Vault providers ({vaultProviderHealth.length})</h2>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Disponível</th>
                <th className="py-2 pr-4">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {vaultProviderHealth.map((h) => (
                <tr key={h.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{h.id}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={HEALTH_VARIANT[String(h.available)] ?? "neutral"}>{h.available ? "disponível" : "indisponível"}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{h.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Readiness por instalação/provider ({allReadiness.length})</h2>
        <p className="text-xs text-muted-foreground">
          Só metadata e status — <code>vault_key</code>/valor de segredo NUNCA são lidos nem exibidos nesta tela.
        </p>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Instalação</th>
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Conexão</th>
                <th className="py-2 pr-4">Secret ref</th>
                <th className="py-2 pr-4">Vault</th>
                <th className="py-2 pr-4">Pronta</th>
                <th className="py-2 pr-4">Blockers</th>
              </tr>
            </thead>
            <tbody>
              {readinessByInstallation.length === 0 && <EmptyRow colSpan={7} label="Nenhuma instalação persistida ainda." />}
              {readinessByInstallation.flatMap(({ installation, readiness }) =>
                readiness.length === 0 ? (
                  <tr key={installation.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 font-medium">{installation.company}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground" colSpan={6}>
                      Nenhuma conexão de provider registrada.
                    </td>
                  </tr>
                ) : (
                  readiness.map((r) => (
                    <tr key={`${installation.id}-${r.provider}`} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 font-medium">{installation.company}</td>
                      <td className="py-2 pr-4">{r.provider}</td>
                      <td className="py-2 pr-4">{r.connectionStatus}</td>
                      <td className="py-2 pr-4">{r.secretReferenceStatus}</td>
                      <td className="py-2 pr-4">{r.vaultProvider ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={READY_VARIANT[String(r.ready)] ?? "neutral"}>{r.ready ? "pronta" : "não"}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{r.blockers.join(", ") || "—"}</td>
                    </tr>
                  ))
                ),
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
