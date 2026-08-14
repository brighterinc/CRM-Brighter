import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";
import {
  buildInstallationCredentialReadiness,
  type ProviderCredentialReadiness,
} from "@/lib/provider-credentials-runtime/control-plane-integration";
import { createDefaultRuntimeVaultProviderRegistry } from "@/lib/provider-credentials-runtime/providers";
import type { Installation } from "@/lib/control-plane/types";
import { isRealProvisioningEnabled } from "@/lib/provisioning-adapters/providers/supabase-real-gate";
import {
  SUPABASE_REAL_OPERATION_CATALOG,
  type SupabaseRealOperationClassification,
} from "@/lib/provisioning-adapters/providers/supabase-real-operations";

export const dynamic = "force-dynamic";

/**
 * `/app/settings/control-plane/providers/supabase` — visão READ-ONLY do Real
 * Supabase Adapter: status de conexão/credencial por instalação, catálogo de
 * operações (classificação REAL_SUPPORTED/DRY_RUN_ONLY/PLANNED) e o gate
 * `REAL_PROVISIONING_ENABLED`. Só platform-admin.
 *
 * NUNCA mostra token/valor de segredo — só metadata/status. Sem botão de
 * criar projeto (fora do escopo desta etapa — ver
 * `docs/providers/supabase/overview.md`).
 */

const CLASSIFICATION_VARIANT: Record<SupabaseRealOperationClassification, "neutral" | "info" | "error" | "warning" | "success"> = {
  real_supported: "success",
  dry_run_only: "warning",
  planned: "neutral",
};

const CLASSIFICATION_LABEL: Record<SupabaseRealOperationClassification, string> = {
  real_supported: "execução real disponível",
  dry_run_only: "só dry-run (mesmo com gate ligado)",
  planned: "reservado — etapa futura",
};

const READY_VARIANT: Record<string, "neutral" | "info" | "error" | "warning" | "success"> = {
  true: "success",
  false: "error",
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

export default async function SupabaseProviderPage() {
  await requirePlatformAdmin();

  const repos = await createControlPlaneRepositories("database");
  const registry = createDefaultRuntimeVaultProviderRegistry();
  const gateEnabled = isRealProvisioningEnabled();

  const installations = await repos.installations.list();
  const [connectionsByInstallation, secretRefsByInstallation] = await Promise.all([
    Promise.all(installations.map((i) => repos.providerConnections.listByInstallation(i.id))),
    Promise.all(installations.map((i) => repos.secretReferences.listByInstallation(i.id))),
  ]);

  const supabaseConnections = connectionsByInstallation.flat().filter((c) => c.provider === "supabase");
  const secretReferencesById = new Map(secretRefsByInstallation.flat().map((s) => [s.id, s]));

  const readinessByInstallation: { installation: Installation; readiness: ProviderCredentialReadiness | null }[] = installations.map(
    (installation) => {
      const readiness = buildInstallationCredentialReadiness({
        installationId: installation.id,
        connections: supabaseConnections,
        secretReferencesById,
        vaultProviderRegistry: registry,
      });
      return { installation, readiness: readiness.find((r) => r.provider === "supabase") ?? null };
    },
  );

  const withConnection = readinessByInstallation.filter((r) => r.readiness !== null);
  const readyCount = withConnection.filter((r) => r.readiness?.ready).length;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Provider — Supabase (Real Adapter)</h1>
        <p className="text-sm text-muted-foreground">
          Primeiro provider real da Provisioning Adapters. Tela somente leitura — nenhum botão de execução real, nenhum
          token exibido, nenhum projeto criado por aqui.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ver também{" "}
          <Link href="/app/settings/control-plane/credentials-runtime" className="underline">
            Provider Credentials Runtime
          </Link>
          ,{" "}
          <Link href="/app/settings/control-plane/persistence" className="underline">
            Control Plane — Persistência
          </Link>{" "}
          e{" "}
          <Link href="/app/settings/provisioning-adapters" className="underline">
            Adaptadores de provisionamento
          </Link>
          . Simulação completa via CLI (<code>pnpm supabase:adapter</code>).
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Gate de execução real</h2>
        <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">REAL_PROVISIONING_ENABLED</p>
            <Badge variant={gateEnabled ? "warning" : "success"}>{gateEnabled ? "ligado" : "desligado (default)"}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Instalações com conexão Supabase</p>
            <p className="font-medium">{withConnection.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Prontas pra resolver credencial</p>
            <p className="font-medium">
              {readyCount}/{withConnection.length}
            </p>
          </div>
        </Card>
        <p className="text-xs text-muted-foreground">
          Mesmo com o gate ligado, só <code>project.validate</code>/<code>project.read</code>/<code>project.status</code>{" "}
          têm execução real implementada nesta etapa — ver catálogo abaixo.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Operações ({SUPABASE_REAL_OPERATION_CATALOG.length})</h2>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Operação</th>
                <th className="py-2 pr-4">Classificação</th>
                <th className="py-2 pr-4">Credencial exigida</th>
                <th className="py-2 pr-4">Endpoint lógico</th>
                <th className="py-2 pr-4">Rollback preview</th>
              </tr>
            </thead>
            <tbody>
              {SUPABASE_REAL_OPERATION_CATALOG.map((entry) => (
                <tr key={entry.operation} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{entry.operation}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={CLASSIFICATION_VARIANT[entry.classification]}>{CLASSIFICATION_LABEL[entry.classification]}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {entry.requiredCredentialPurpose} / {entry.requiredSecretType}
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{entry.endpoint}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={entry.supportsRollbackPreview ? "info" : "neutral"}>{entry.supportsRollbackPreview ? "sim" : "não"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Readiness por instalação ({readinessByInstallation.length})</h2>
        <p className="text-xs text-muted-foreground">
          Só metadata e status — <code>vault_key</code>/valor de segredo NUNCA são lidos nem exibidos nesta tela.
        </p>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Instalação</th>
                <th className="py-2 pr-4">Conexão</th>
                <th className="py-2 pr-4">Secret ref</th>
                <th className="py-2 pr-4">Vault</th>
                <th className="py-2 pr-4">Pronta</th>
                <th className="py-2 pr-4">Blockers</th>
                <th className="py-2 pr-4">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {readinessByInstallation.length === 0 && <EmptyRow colSpan={7} label="Nenhuma instalação persistida ainda." />}
              {readinessByInstallation.map(({ installation, readiness }) => (
                <tr key={installation.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 font-medium">{installation.company}</td>
                  {readiness ? (
                    <>
                      <td className="py-2 pr-4">{readiness.connectionStatus}</td>
                      <td className="py-2 pr-4">{readiness.secretReferenceStatus}</td>
                      <td className="py-2 pr-4">{readiness.vaultProvider ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={READY_VARIANT[String(readiness.ready)]}>{readiness.ready ? "sim" : "não"}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs text-error-fg">{readiness.blockers.join(", ") || "—"}</td>
                      <td className="py-2 pr-4 text-xs text-warning-fg">{readiness.warnings.join(", ") || "—"}</td>
                    </>
                  ) : (
                    <td className="py-2 pr-4 text-xs text-muted-foreground" colSpan={6}>
                      Nenhuma conexão Supabase registrada pra esta instalação.
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
