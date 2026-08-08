/**
 * Versionamento comercial — spec §12. Compara versões `MAJOR.MINOR.PATCH`
 * (SemVer simplificado, sem pre-release/build metadata). Nunca executa
 * migration real — `requiresMigration`/`recommendation` são só sinalização.
 */
import type {
  MarketplaceModuleDefinition,
  MarketplaceValidationError,
  MarketplaceVersionChangeKind,
  MarketplaceVersionCompatibility,
  MarketplaceVersionPlan,
  ModuleLicense,
} from "./types";

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

function parseVersion(version: string): [number, number, number] | null {
  const match = SEMVER_RE.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** -1 = a < b · 0 = a === b · 1 = a > b. `null` quando alguma versão não é SemVer válido. */
export function compareVersions(a: string, b: string): number | null {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return null;
  for (let i = 0; i < 3; i += 1) {
    const partA = va[i]!;
    const partB = vb[i]!;
    if (partA !== partB) return partA < partB ? -1 : 1;
  }
  return 0;
}

export function validateLicenseVersion(license: ModuleLicense, marketplaceModule: MarketplaceModuleDefinition): MarketplaceValidationError[] {
  const errors: MarketplaceValidationError[] = [];
  if (!license.version) return errors;
  if (!parseVersion(license.version)) {
    errors.push({ field: "version", message: `versão "${license.version}" não é SemVer válido (MAJOR.MINOR.PATCH)` });
  }
  if (!parseVersion(marketplaceModule.version)) {
    errors.push({ field: "marketplaceModule.version", message: `versão do catálogo "${marketplaceModule.version}" não é SemVer válido` });
  }
  return errors;
}

export function evaluateVersionCompatibility(moduleId: string, fromVersion: string, toVersion: string): MarketplaceVersionCompatibility {
  const cmp = compareVersions(fromVersion, toVersion);
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (cmp === null) {
    blockers.push(`não foi possível comparar "${fromVersion}" -> "${toVersion}" — formato inválido`);
    return { moduleId, fromVersion, toVersion, compatible: false, changeKind: "none", warnings, blockers };
  }

  const changeKind: MarketplaceVersionChangeKind = cmp === 0 ? "none" : cmp < 0 ? "upgrade" : "downgrade";
  const [fromMajor] = parseVersion(fromVersion)!;
  const [toMajor] = parseVersion(toVersion)!;

  if (changeKind === "upgrade" && toMajor > fromMajor) {
    warnings.push(`upgrade de major version (${fromVersion} -> ${toVersion}) — pode exigir migration de dados`);
  }
  if (changeKind === "downgrade" && toMajor < fromMajor) {
    warnings.push(`downgrade de major version (${fromVersion} -> ${toVersion}) — pode não ser reversível sem perda de configuração`);
  }

  return { moduleId, fromVersion, toVersion, compatible: true, changeKind, warnings, blockers };
}

function planVersionChange(license: ModuleLicense, toVersion: string, expectedKind: "upgrade" | "downgrade"): MarketplaceVersionPlan {
  const fromVersion = license.version ?? "0.0.0";
  const compatibility = evaluateVersionCompatibility(license.moduleId, fromVersion, toVersion);

  const blockers = [...compatibility.blockers];
  if (compatibility.changeKind !== "none" && compatibility.changeKind !== expectedKind) {
    blockers.push(`"${toVersion}" não é um ${expectedKind === "upgrade" ? "upgrade" : "downgrade"} válido a partir de "${fromVersion}"`);
  }

  const requiresMigration = compatibility.warnings.some((w) => w.includes("migration") || w.includes("perda de configuração"));

  return {
    moduleId: license.moduleId,
    licenseId: license.id,
    fromVersion,
    toVersion,
    changeKind: expectedKind,
    requiresMigration,
    blockers,
    warnings: compatibility.warnings,
    recommendation: blockers.length > 0 ? "bloqueado — corrigir a versão de destino" : requiresMigration ? "planejar migration antes de aplicar (nenhuma migration executada nesta Foundation)" : "pronto — nenhuma ação real será executada nesta Foundation",
  };
}

export function planVersionUpgrade(license: ModuleLicense, toVersion: string): MarketplaceVersionPlan {
  return planVersionChange(license, toVersion, "upgrade");
}

export function planVersionDowngrade(license: ModuleLicense, toVersion: string): MarketplaceVersionPlan {
  return planVersionChange(license, toVersion, "downgrade");
}

export function deriveVersionWarnings(marketplaceModule: MarketplaceModuleDefinition, license: ModuleLicense): string[] {
  const warnings: string[] = [];
  if (!license.version) return warnings;
  const cmp = compareVersions(license.version, marketplaceModule.version);
  if (cmp === null) {
    warnings.push(`versão da licença "${license.version}" não comparável com a versão atual do catálogo "${marketplaceModule.version}"`);
  } else if (cmp < 0) {
    warnings.push(`licença em versão desatualizada ("${license.version}") — versão atual do catálogo é "${marketplaceModule.version}"`);
  }
  if (marketplaceModule.status === "deprecated") {
    warnings.push(`"${marketplaceModule.moduleId}" está deprecated na versão atual — considere planejar migração`);
  }
  return warnings;
}
