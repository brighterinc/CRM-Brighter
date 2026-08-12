import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createControlPlaneRepositories } from "@/lib/control-plane-persistence/repositories/factory";
import type { Installation } from "@/lib/control-plane/types";
import type { Tenant } from "@/lib/tenants/types";

export const dynamic = "force-dynamic";

/**
 * `/app/settings/control-plane/persistence` — visão READ-ONLY dos dados
 * REAIS persistidos (`control_plane_*`, migration `0098`). Diferente de
 * `/app/settings/control-plane` (catálogo de demonstração in-memory, Control
 * Plane Foundation v1): esta tela lê `mode: "database"`.
 *
 * Só platform-admin (`requirePlatformAdmin()` — MFA AAL2 forçada, mesmo
 * guard de `/admin/*`), nunca admin de tenant: os dados aqui cruzam TODAS as
 * instalações da Brighter, e "tenant admin nunca enxerga outro tenant" só é
 * garantido não dando visão nenhuma pra quem não é platform-admin.
 *
 * NUNCA mostra `vault_key`/segredo — só metadata segura de secret reference.
 * Não tem tela de inserir API key (fora do escopo desta etapa).
 */

const INSTALLATION_STATUS_VARIANT: Record<string, "neutral" | "info" | "error" | "warning" | "success"> = {
  planned: "neutral",
  provisioning: "info",
  deploying: "info",
  waiting_dns: "warning",
  waiting_ssl: "warning",
  waiting_customer: "warning",
  active: "success",
  maintenance: "warning",
  paused: "neutral",
  archived: "neutral",
  error: "error",
};

const SECRET_STATUS_VARIANT: Record<string, "neutral" | "info" | "error" | "warning" | "success"> = {
  pending: "neutral",
  active: "success",
  rotated: "info",
  revoked: "error",
};

const SEVERITY_VARIANT: Record<string, "neutral" | "info" | "error" | "warning" | "success"> = {
  info: "info",
  warning: "warning",
  error: "error",
  success: "success",
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

function TenantsTable({ tenants }: { tenants: Tenant[] }) {
  return (
    <Card className="overflow-x-auto p-4">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="py-2 pr-4">Cliente</th>
            <th className="py-2 pr-4">Slug</th>
            <th className="py-2 pr-4">Plano</th>
            <th className="py-2 pr-4">Comercial</th>
            <th className="py-2 pr-4">Técnico</th>
          </tr>
        </thead>
        <tbody>
          {tenants.length === 0 && <EmptyRow colSpan={5} label="Nenhum tenant persistido ainda." />}
          {tenants.map((tenant) => (
            <tr key={tenant.id} className="border-b border-border last:border-0">
              <td className="py-2 pr-4 font-medium">{tenant.clientName}</td>
              <td className="py-2 pr-4 text-xs text-muted-foreground">{tenant.clientSlug}</td>
              <td className="py-2 pr-4">{tenant.plan}</td>
              <td className="py-2 pr-4">{tenant.commercialStatus}</td>
              <td className="py-2 pr-4">{tenant.technicalStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function InstallationsTable({ installations }: { installations: Installation[] }) {
  return (
    <Card className="overflow-x-auto p-4">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="py-2 pr-4">Instalação</th>
            <th className="py-2 pr-4">Slug</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Comercial</th>
            <th className="py-2 pr-4">Técnico</th>
          </tr>
        </thead>
        <tbody>
          {installations.length === 0 && <EmptyRow colSpan={5} label="Nenhuma installation persistida ainda." />}
          {installations.map((installation) => (
            <tr key={installation.id} className="border-b border-border last:border-0">
              <td className="py-2 pr-4 font-medium">{installation.company}</td>
              <td className="py-2 pr-4 text-xs text-muted-foreground">{installation.slug}</td>
              <td className="py-2 pr-4">
                <Badge variant={INSTALLATION_STATUS_VARIANT[installation.status] ?? "neutral"}>{installation.status}</Badge>
              </td>
              <td className="py-2 pr-4">{installation.commercial}</td>
              <td className="py-2 pr-4">{installation.technical}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default async function ControlPlanePersistencePage() {
  await requirePlatformAdmin();

  const repos = await createControlPlaneRepositories("database");

  const [tenants, installations, events] = await Promise.all([
    repos.tenants.list(),
    repos.installations.list(),
    repos.operationEvents.listRecent(50),
  ]);

  const [deploymentsByInstallation, runsByInstallation, connectionsByInstallation, secretsByInstallation] = await Promise.all([
    Promise.all(installations.map((i) => repos.deployments.listByInstallation(i.id))),
    Promise.all(installations.map((i) => repos.provisioning.listRunsByInstallation(i.id))),
    Promise.all(installations.map((i) => repos.providerConnections.listByInstallation(i.id))),
    Promise.all(installations.map((i) => repos.secretReferences.listByInstallation(i.id))),
  ]);

  const deployments = deploymentsByInstallation.flat();
  const runs = runsByInstallation.flat();
  const connections = connectionsByInstallation.flat();
  const secrets = secretsByInstallation.flat();

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Control Plane — Persistência</h1>
        <p className="text-sm text-muted-foreground">
          Dados REAIS persistidos (tabelas <code>control_plane_*</code>, migration 0098) — nunca o catálogo de
          demonstração. Só platform-admin. Nenhum valor de segredo é mostrado aqui.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ver também{" "}
          <Link href="/app/settings/control-plane" className="underline">
            Control Plane (demonstração)
          </Link>
          .
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Resumo</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Tenants</p>
            <p className="text-2xl font-semibold">{tenants.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Installations</p>
            <p className="text-2xl font-semibold">{installations.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Provisioning runs</p>
            <p className="text-2xl font-semibold">{runs.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Secret references</p>
            <p className="text-2xl font-semibold">{secrets.length}</p>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Tenants ({tenants.length})</h2>
        <TenantsTable tenants={tenants} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Installations ({installations.length})</h2>
        <InstallationsTable installations={installations} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Deployments ({deployments.length})</h2>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Fingerprint</th>
                <th className="py-2 pr-4">Target</th>
                <th className="py-2 pr-4">Plano</th>
                <th className="py-2 pr-4">Gerado em</th>
              </tr>
            </thead>
            <tbody>
              {deployments.length === 0 && <EmptyRow colSpan={4} label="Nenhum deployment registrado ainda." />}
              {deployments.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{d.manifestFingerprint.slice(0, 16)}…</td>
                  <td className="py-2 pr-4">{d.target}</td>
                  <td className="py-2 pr-4">{d.plan}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{d.generatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Provisioning runs ({runs.length})</h2>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Plano</th>
                <th className="py-2 pr-4">Target</th>
                <th className="py-2 pr-4">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && <EmptyRow colSpan={4} label="Nenhum run de provisionamento ainda." />}
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">
                    <Badge variant="info">{run.status}</Badge>
                  </td>
                  <td className="py-2 pr-4">{run.plan}</td>
                  <td className="py-2 pr-4">{run.target}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{run.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Provider connections ({connections.length})</h2>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Mode</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {connections.length === 0 && <EmptyRow colSpan={3} label="Nenhuma conexão de provider registrada ainda." />}
              {connections.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">{c.provider}</td>
                  <td className="py-2 pr-4">{c.mode}</td>
                  <td className="py-2 pr-4">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Secret references ({secrets.length})</h2>
        <p className="text-xs text-muted-foreground">
          Só metadata — nunca o valor do segredo. <code>vault_key</code> nunca é lido nem exibido nesta tela.
        </p>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Referência</th>
                <th className="py-2 pr-4">Tipo</th>
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Vault</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {secrets.length === 0 && <EmptyRow colSpan={5} label="Nenhuma referência de segredo registrada ainda." />}
              {secrets.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{s.reference}</td>
                  <td className="py-2 pr-4">{s.type}</td>
                  <td className="py-2 pr-4">{s.provider}</td>
                  <td className="py-2 pr-4">{s.vaultProvider}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={SECRET_STATUS_VARIANT[s.status] ?? "neutral"}>{s.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Operation events (últimos {events.length})</h2>
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4">Quando</th>
                <th className="py-2 pr-4">Tipo</th>
                <th className="py-2 pr-4">Severidade</th>
                <th className="py-2 pr-4">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && <EmptyRow colSpan={4} label="Nenhum evento registrado ainda." />}
              {events.map((event) => (
                <tr key={event.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{event.occurredAt}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{event.eventType}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={SEVERITY_VARIANT[event.severity] ?? "neutral"}>{event.severity}</Badge>
                  </td>
                  <td className="py-2 pr-4">{event.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
