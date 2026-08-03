/**
 * Catálogo de metadados de status da Control Plane — label em pt-BR,
 * descrição operacional e categoria, usado pela tela admin (badges) e pelo
 * CLI (`scripts/control-plane-summary.ts`). `status.ts` tem o vocabulário
 * cru + guards; este arquivo é a camada de apresentação sobre ele — mesmo
 * padrão de `ProvisioningStepDefinition` em `lib/provisioning/catalog.ts`
 * (tipo + catálogo tipado + getter), nunca reimplementado, só aplicado a
 * status em vez de etapas.
 */
import { COMMERCIAL_STATUSES, INSTALLATION_STATUSES, TECHNICAL_STATUSES } from "./status";
import type { CommercialStatus, InstallationStatus, TechnicalStatus } from "./types";

export type InstallationStatusCategory = "planning" | "provisioning" | "waiting" | "operational" | "terminal";

export type InstallationStatusDefinition = {
  id: InstallationStatus;
  label: string;
  description: string;
  category: InstallationStatusCategory;
  /** `true` quando a instalação depende de uma ação externa pra sair deste status. */
  isBlocking: boolean;
};

export const INSTALLATION_STATUS_CATALOG: InstallationStatusDefinition[] = [
  {
    id: "planned",
    label: "Planejada",
    description: "Instalação registrada, ainda sem execução iniciada.",
    category: "planning",
    isBlocking: false,
  },
  {
    id: "provisioning",
    label: "Provisionando",
    description: "Etapas de provisionamento em andamento (banco, auth, storage).",
    category: "provisioning",
    isBlocking: false,
  },
  {
    id: "deploying",
    label: "Implantando",
    description: "Aplicação sendo publicada no target (Vercel/Cloudflare/VPS).",
    category: "provisioning",
    isBlocking: false,
  },
  {
    id: "waiting_dns",
    label: "Aguardando DNS",
    description: "Aguardando o cliente apontar o domínio para a instalação.",
    category: "waiting",
    isBlocking: true,
  },
  {
    id: "waiting_ssl",
    label: "Aguardando SSL",
    description: "Domínio apontado, aguardando emissão/propagação de certificado.",
    category: "waiting",
    isBlocking: true,
  },
  {
    id: "waiting_customer",
    label: "Aguardando cliente",
    description: "Bloqueada por uma ação pendente do próprio cliente (dado, aprovação, pagamento).",
    category: "waiting",
    isBlocking: true,
  },
  {
    id: "active",
    label: "Ativa",
    description: "Instalação em produção, operando normalmente.",
    category: "operational",
    isBlocking: false,
  },
  {
    id: "maintenance",
    label: "Em manutenção",
    description: "Intervenção planejada em andamento — indisponibilidade esperada.",
    category: "operational",
    isBlocking: false,
  },
  {
    id: "paused",
    label: "Pausada",
    description: "Instalação temporariamente suspensa (ex.: inadimplência), sem ser cancelamento.",
    category: "operational",
    isBlocking: false,
  },
  {
    id: "archived",
    label: "Arquivada",
    description: "Encerrada — não recebe mais atualização nem monitoramento.",
    category: "terminal",
    isBlocking: false,
  },
  {
    id: "error",
    label: "Com erro",
    description: "Falha detectada que exige intervenção manual da equipe Brighter.",
    category: "terminal",
    isBlocking: true,
  },
];

export type CommercialStatusDefinition = { id: CommercialStatus; label: string; rank: number };

export const COMMERCIAL_STATUS_CATALOG: CommercialStatusDefinition[] = [
  { id: "lead", label: "Lead", rank: 1 },
  { id: "proposal", label: "Proposta enviada", rank: 2 },
  { id: "contract", label: "Contrato assinado", rank: 3 },
  { id: "payment_pending", label: "Pagamento pendente", rank: 4 },
  { id: "implementation", label: "Em implantação", rank: 5 },
  { id: "production", label: "Em produção", rank: 6 },
  { id: "cancelled", label: "Cancelado", rank: 0 },
];

export type TechnicalStatusDefinition = { id: TechnicalStatus; label: string };

export const TECHNICAL_STATUS_CATALOG: TechnicalStatusDefinition[] = [
  { id: "draft", label: "Rascunho" },
  { id: "validated", label: "Validada" },
  { id: "ready", label: "Pronta" },
  { id: "deploying", label: "Implantando" },
  { id: "running", label: "Rodando" },
  { id: "warning", label: "Com aviso" },
  { id: "failed", label: "Falhou" },
];

export function getInstallationStatusDefinition(id: InstallationStatus): InstallationStatusDefinition {
  const def = INSTALLATION_STATUS_CATALOG.find((d) => d.id === id);
  if (!def) throw new Error(`status de instalação desconhecido no catálogo: "${id}"`);
  return def;
}

export function getCommercialStatusDefinition(id: CommercialStatus): CommercialStatusDefinition {
  const def = COMMERCIAL_STATUS_CATALOG.find((d) => d.id === id);
  if (!def) throw new Error(`status comercial desconhecido no catálogo: "${id}"`);
  return def;
}

export function getTechnicalStatusDefinition(id: TechnicalStatus): TechnicalStatusDefinition {
  const def = TECHNICAL_STATUS_CATALOG.find((d) => d.id === id);
  if (!def) throw new Error(`status técnico desconhecido no catálogo: "${id}"`);
  return def;
}

/** Sanidade do catálogo: todo status do vocabulário (`status.ts`) tem exatamente 1 definição. */
export function validateStatusCatalogsCoverage(): string[] {
  const errors: string[] = [];

  for (const id of INSTALLATION_STATUSES) {
    const count = INSTALLATION_STATUS_CATALOG.filter((d) => d.id === id).length;
    if (count !== 1) errors.push(`InstallationStatus "${id}" tem ${count} definição(ões) no catálogo (esperado 1)`);
  }
  for (const id of COMMERCIAL_STATUSES) {
    const count = COMMERCIAL_STATUS_CATALOG.filter((d) => d.id === id).length;
    if (count !== 1) errors.push(`CommercialStatus "${id}" tem ${count} definição(ões) no catálogo (esperado 1)`);
  }
  for (const id of TECHNICAL_STATUSES) {
    const count = TECHNICAL_STATUS_CATALOG.filter((d) => d.id === id).length;
    if (count !== 1) errors.push(`TechnicalStatus "${id}" tem ${count} definição(ões) no catálogo (esperado 1)`);
  }

  return errors;
}
