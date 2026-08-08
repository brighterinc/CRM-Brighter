/**
 * `resolveMarketplaceEntitlements` — spec §10. Combina Module Engine
 * (`installation.enabledModules`, já resolvido — DISABLED_MODULES/plano/
 * dependência têm precedência estrutural), Billing (`billingAuthorizedModuleIds`,
 * já resolvido por `resolveBillingEntitlements` em `integrations.ts` — este
 * arquivo nunca importa `lib/billing/*` diretamente, mesma pureza de
 * `eligibility.ts`), licenças e trials do tenant, e o catálogo comercial.
 *
 * O Marketplace NUNCA concede além do que `installation.enabledModules` já
 * autoriza tecnicamente, e NUNCA concede o que Billing já negou — só pode
 * NEGAR ainda mais (licença ausente/expirada/suspensa/cancelada/revogada).
 */
import type {
  MarketplaceEntitlementsResult,
  MarketplaceModuleDefinition,
  MarketplaceModuleEntitlement,
  ModuleLicense,
  ModuleTrial,
} from "./types";

function isCoreModule(moduleId: string): boolean {
  return moduleId.startsWith("core.");
}

export type ResolveMarketplaceEntitlementsInput = {
  installation: { enabledModules: string[] };
  catalog: MarketplaceModuleDefinition[];
  /** Licenças do TENANT alvo — outros tenants nunca entram aqui (isolamento é responsabilidade de quem monta o input). */
  licenses: ModuleLicense[];
  trials: ModuleTrial[];
  /** `authorizedModules` já resolvido por `resolveBillingEntitlements` (Billing só pode NEGAR). `undefined` = sem checagem financeira adicional (ex.: simulação isolada). */
  billingAuthorizedModuleIds?: string[];
};

function latestLicenseFor(licenses: ModuleLicense[], moduleId: string): ModuleLicense | undefined {
  return licenses
    .filter((l) => l.moduleId === moduleId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
}

function activeTrialFor(trials: ModuleTrial[], moduleId: string): ModuleTrial | undefined {
  return trials.find((t) => t.moduleId === moduleId && t.status === "active");
}

export function resolveMarketplaceEntitlements(input: ResolveMarketplaceEntitlementsInput): MarketplaceEntitlementsResult {
  const entitlements: MarketplaceModuleEntitlement[] = input.catalog.map((mkt) => {
    const id = mkt.moduleId;
    const technicallyEnabled = input.installation.enabledModules.includes(id);
    const billingBlocked = input.billingAuthorizedModuleIds !== undefined && !input.billingAuthorizedModuleIds.includes(id);
    const license = latestLicenseFor(input.licenses, id);
    const trial = activeTrialFor(input.trials, id);
    const core = isCoreModule(id);

    if (mkt.status === "planned") {
      return { moduleId: id, authorized: false, restricted: false, source: "module_planned", reason: `"${id}" está planned — nunca autorizado em produção` };
    }
    if (mkt.status === "retired") {
      return { moduleId: id, authorized: false, restricted: false, source: "module_retired", reason: `"${id}" está retired — nunca licenciável` };
    }
    if (mkt.status === "disabled" || !mkt.enabled) {
      return { moduleId: id, authorized: false, restricted: false, source: "module_disabled_commercially", reason: `"${id}" está desabilitado comercialmente` };
    }
    if (!technicallyEnabled) {
      return { moduleId: id, authorized: false, restricted: false, source: "blocked_by_module_engine", reason: `"${id}" não está habilitado tecnicamente (Module Engine)` };
    }

    // Trial NUNCA passa por Billing (spec §8/§9 — "não executar cobrança"): um
    // trial ativo, ou uma licença NASCIDA de trial, autoriza independente do
    // gate financeiro — só a checagem técnica acima (planned/retired/module
    // engine) pode negar um trial.
    if (trial) {
      return { moduleId: id, authorized: true, restricted: false, source: "trial_active", reason: `"${id}" autorizado por trial ativo (até ${trial.endsAt})` };
    }
    if (license?.source === "trial" && (license.status === "active" || license.status === "grace_period")) {
      return { moduleId: id, authorized: true, restricted: false, source: "trial_active", reason: `"${id}" licença originada de trial convertido` };
    }

    if (billingBlocked) {
      if (core) {
        return { moduleId: id, authorized: true, restricted: true, source: "blocked_by_billing", reason: `"${id}" é core — permanece em modo restrito apesar de não autorizado pelo Billing` };
      }
      return { moduleId: id, authorized: false, restricted: false, source: "blocked_by_billing", reason: `"${id}" não autorizado pelo Billing Engine` };
    }

    if (!license) {
      if (core) {
        return { moduleId: id, authorized: true, restricted: false, source: "included_in_plan", reason: `"${id}" é core — incluído por padrão` };
      }
      return { moduleId: id, authorized: false, restricted: false, source: "not_licensed", reason: `"${id}" sem licença registrada para este tenant` };
    }

    switch (license.status) {
      case "active":
      case "grace_period":
        return { moduleId: id, authorized: true, restricted: false, source: license.source === "bundle" ? "bundle" : license.source === "paid_addon" ? "paid_addon" : "included_in_plan", reason: `"${id}" licença "${license.status}" (fonte: ${license.source})` };
      case "trial":
        return { moduleId: id, authorized: true, restricted: false, source: "trial_active", reason: `"${id}" licença em trial` };
      case "suspended":
        if (core) {
          return { moduleId: id, authorized: true, restricted: true, source: "license_suspended", reason: `"${id}" é core — modo restrito com licença suspensa, dados preservados` };
        }
        return { moduleId: id, authorized: false, restricted: false, source: "license_suspended", reason: `"${id}" licença suspensa` };
      case "expired":
        if (core) {
          return { moduleId: id, authorized: true, restricted: true, source: "license_expired", reason: `"${id}" é core — modo restrito com licença expirada, dados preservados` };
        }
        return { moduleId: id, authorized: false, restricted: false, source: "license_expired", reason: `"${id}" licença expirada` };
      case "cancelled":
        return { moduleId: id, authorized: false, restricted: false, source: "license_cancelled", reason: `"${id}" licença cancelada` };
      case "revoked":
        return { moduleId: id, authorized: false, restricted: false, source: "license_revoked", reason: `"${id}" licença revogada` };
      case "draft":
      default:
        if (core) {
          return { moduleId: id, authorized: true, restricted: false, source: "included_in_plan", reason: `"${id}" é core — incluído por padrão` };
        }
        return { moduleId: id, authorized: false, restricted: false, source: "not_licensed", reason: `"${id}" licença ainda em draft — não autorizado` };
    }
  });

  const authorizedModules = entitlements.filter((e) => e.authorized).map((e) => e.moduleId);
  const deniedModules = entitlements.filter((e) => !e.authorized).map((e) => e.moduleId);
  const trialModules = entitlements.filter((e) => e.source === "trial_active").map((e) => e.moduleId);
  const expiredModules = entitlements.filter((e) => e.source === "license_expired").map((e) => e.moduleId);
  const suspendedModules = entitlements.filter((e) => e.source === "license_suspended").map((e) => e.moduleId);
  const includedModules = entitlements.filter((e) => e.source === "included_in_plan" && e.authorized).map((e) => e.moduleId);
  const addonModules = entitlements.filter((e) => e.source === "paid_addon" && e.authorized).map((e) => e.moduleId);
  const privateModules = input.catalog.filter((m) => m.visibility === "private").map((m) => m.moduleId);

  const warnings: string[] = [];
  const blockers: string[] = [];
  const restricted = entitlements.filter((e) => e.restricted);
  if (restricted.length > 0) {
    warnings.push(`${restricted.length} módulo(s) core em modo restrito — dados preservados, nenhuma remoção executada`);
  }
  const denied = entitlements.filter((e) => !e.authorized);
  if (denied.length > 0) {
    blockers.push(`${denied.length} módulo(s) sem autorização comercial: ${denied.map((e) => e.moduleId).join(", ")}`);
  }

  return {
    entitlements,
    authorizedModules,
    deniedModules,
    trialModules,
    expiredModules,
    suspendedModules,
    includedModules,
    addonModules,
    privateModules,
    warnings,
    blockers,
    reasons: entitlements.map((e) => e.reason),
  };
}
