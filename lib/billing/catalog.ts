/**
 * Catálogo comercial do Brighter Billing Engine — Foundation v1.
 *
 * `basePrice` aqui é PREÇO DE DEMONSTRAÇÃO, deliberadamente marcado como
 * placeholder — nunca o preço comercial real da Brighter. O valor real será
 * configurado futuramente na Control Plane (ver ROADMAP.md, "Persistência
 * real da Control Plane"). `amountCents: 0` também é válido nesta Foundation
 * e significa a mesma coisa: "a configurar".
 *
 * Cada `BillingPlanDefinition` referencia um `DeploymentPlan` já resolvido
 * pelo Module/Deployment Engine (`lib/modules/catalog.ts`) — nunca redefine
 * compatibilidade de módulo ou requisito de infraestrutura. `includedModules`/
 * `optionalModules` são ids do MESMO `MODULE_CATALOG`; um módulo fora de
 * `allowedPlans` daquele `deploymentPlan` nunca deveria aparecer aqui (ver
 * `validation.ts::validateBillingPlanDefinition`).
 */
import { MODULE_CATALOG } from "@/lib/modules/catalog";
import type { BillingCycle, BillingLimits, BillingPlanDefinition } from "./types";

const ALL_CYCLES: BillingCycle[] = ["monthly", "quarterly", "semiannual", "annual"];

/** Só módulos `status !== "planned"` e permitidos no plano — nunca redecide o que o Module Engine já resolveu. */
function stableAndAllowed(plan: "lite" | "pro" | "dedicated", ids: string[]): string[] {
  return MODULE_CATALOG.filter((m) => ids.includes(m.id) && m.status !== "planned" && m.allowedPlans.includes(plan)).map(
    (m) => m.id,
  );
}

const CORE_MODULES = ["core.crm", "core.contacts", "core.pipeline", "core.tasks", "core.team"];
const AI_MODULES = ["ai.agents", "ai.memory", "ai.rag"];
const AUTOMATION_MODULES = ["automation.webhooks", "automation.followups"];
const BASE_MODULES = [...CORE_MODULES, "channel.email", "compliance.lgpd", "analytics.metrics"];

const LITE_LIMITS: BillingLimits = {
  users: 5,
  contacts: 2000,
  storageMb: 1024,
  messagesPerMonth: 1000,
  aiActionsPerMonth: 500,
};

const PRO_LIMITS: BillingLimits = {
  users: 20,
  contacts: 20000,
  storageMb: 10240,
  messagesPerMonth: 10000,
  campaignsPerMonth: 20,
  aiActionsPerMonth: 5000,
};

const DEDICATED_LIMITS: BillingLimits = {
  // Ausente = ilimitado/não controlado nesta Foundation (ver types.ts::BillingLimits).
};

export const BILLING_PLAN_CATALOG: BillingPlanDefinition[] = [
  {
    id: "lite",
    name: "Lite",
    description: "CRM + IA sem canal próprio — placeholder de demonstração desta Foundation.",
    deploymentPlan: "lite",
    allowedCycles: ALL_CYCLES,
    basePrice: { amountCents: 0, currency: "BRL" },
    includedModules: stableAndAllowed("lite", BASE_MODULES),
    optionalModules: stableAndAllowed("lite", AI_MODULES),
    limits: LITE_LIMITS,
    gracePeriodDays: 5,
    upgradeTo: ["pro", "dedicated"],
    downgradeTo: [],
    enabled: true,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Automações leves e integrações gerenciadas — placeholder de demonstração desta Foundation.",
    deploymentPlan: "pro",
    allowedCycles: ALL_CYCLES,
    basePrice: { amountCents: 0, currency: "BRL" },
    includedModules: stableAndAllowed("pro", [...BASE_MODULES, ...AI_MODULES, ...AUTOMATION_MODULES]),
    optionalModules: stableAndAllowed("pro", ["integration.nuvemshop"]),
    limits: PRO_LIMITS,
    gracePeriodDays: 7,
    upgradeTo: ["dedicated"],
    downgradeTo: ["lite"],
    enabled: true,
  },
  {
    id: "dedicated",
    name: "Dedicated",
    description: "VPS exclusiva, WhatsApp (WAHA), IA contínua — placeholder de demonstração desta Foundation.",
    deploymentPlan: "dedicated",
    allowedCycles: ALL_CYCLES,
    basePrice: { amountCents: 0, currency: "BRL" },
    includedModules: stableAndAllowed("dedicated", [
      ...BASE_MODULES,
      ...AI_MODULES,
      ...AUTOMATION_MODULES,
      "channel.whatsapp",
      "integration.nuvemshop",
    ]),
    optionalModules: [],
    limits: DEDICATED_LIMITS,
    gracePeriodDays: 10,
    upgradeTo: [],
    downgradeTo: ["pro"],
    enabled: true,
  },
];

export function getBillingPlanDefinition(planId: string): BillingPlanDefinition | undefined {
  return BILLING_PLAN_CATALOG.find((p) => p.id === planId);
}

export function isUpgrade(fromPlanId: string, toPlanId: string): boolean {
  const from = getBillingPlanDefinition(fromPlanId);
  return from?.upgradeTo.includes(toPlanId) ?? false;
}

export function isDowngrade(fromPlanId: string, toPlanId: string): boolean {
  const from = getBillingPlanDefinition(fromPlanId);
  return from?.downgradeTo.includes(toPlanId) ?? false;
}
