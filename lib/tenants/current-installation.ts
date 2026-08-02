/**
 * Tenant de leitura da instalação ATUAL — só para a tela administrativa
 * (`/app/settings/operacao`). Nunca persistido, nunca passa por
 * `InMemoryTenantRepository`. Monta um `Tenant` a partir de fontes já
 * públicas desta instalação: `branding()`, `getDeploymentPlan()`/
 * `getEnabledModules()` (Module Engine), `generateDeploymentManifest()`
 * (Deployment Engine) e `env.NEXT_PUBLIC_APP_URL`/`env.NEXT_PUBLIC_SUPABASE_URL`
 * (já expostos ao navegador hoje — nunca a anon key, que nem existe no tipo
 * `TenantSupabaseReference`).
 *
 * `deriveInstallSlug`/`deriveInstallDomain` migraram pra cá de
 * `app/app/settings/deployment/page.tsx`, que agora importa daqui — reduz
 * duplicação em vez de criar uma nova.
 *
 * Referências de infraestrutura/Supabase ficam PARCIAIS de propósito: esta
 * Foundation não persiste `provider`/`externalId`/`projectReference` de
 * nenhuma instalação (isso é trabalho da futura Control Plane) — a
 * readiness resultante mostra esse gap honestamente como pendência, não
 * inventa dado que a instalação não rastreia hoje.
 */
import { branding } from "@/lib/branding";
import { generateDeploymentManifest } from "@/lib/deployment";
import { getDeploymentProfile } from "@/lib/deployment/profiles";
import { env } from "@/lib/env";
import { getDeploymentPlan, getEnabledModules } from "@/lib/modules/runtime";

import type { Tenant } from "./types";

export function deriveInstallSlug(appUrl: string): string {
  try {
    const hostname = new URL(appUrl).hostname.toLowerCase();
    const slug = hostname.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug.length > 0 ? slug : "instalacao";
  } catch {
    return "instalacao";
  }
}

export function deriveInstallDomain(appUrl: string): string {
  try {
    return new URL(appUrl).hostname;
  } catch {
    return appUrl;
  }
}

function deriveSupabaseProjectRef(supabaseUrl: string): string | undefined {
  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    return projectRef && projectRef.length > 0 ? projectRef : undefined;
  } catch {
    return undefined;
  }
}

export function getCurrentInstallationTenant(): Tenant {
  const plan = getDeploymentPlan();
  const profile = getDeploymentProfile(plan);
  const enabledModuleIds = getEnabledModules().map((m) => m.id);
  const install = branding();
  const domain = deriveInstallDomain(env.NEXT_PUBLIC_APP_URL);
  const slug = deriveInstallSlug(env.NEXT_PUBLIC_APP_URL);

  const clientBranding = {
    appName: install.name,
    legalName: install.legalName,
    logoUrl: install.logoUrl ?? undefined,
    faviconUrl: install.faviconUrl ?? undefined,
    supportEmail: install.supportEmail ?? undefined,
    websiteUrl: install.websiteUrl ?? undefined,
    fromName: install.fromName,
    fromEmail: install.fromEmail ?? undefined,
  };

  const manifest = generateDeploymentManifest({
    clientName: install.name,
    clientSlug: slug,
    domain,
    plan,
    requestedModules: enabledModuleIds,
    branding: clientBranding,
  });

  const now = new Date().toISOString();

  return {
    // Nunca UUID de propósito — este tenant é sintético e nunca passa por
    // validateTenantInput()/InMemoryTenantRepository, então não precisa (e
    // não deveria) simular uma identidade que não existe.
    id: "current-installation",
    clientName: install.name,
    clientSlug: slug,
    legalName: install.legalName,
    domain,
    plan,
    requestedModules: enabledModuleIds,
    enabledModules: manifest.enabledModules,
    branding: clientBranding,
    commercialStatus: "active",
    technicalStatus: "live",
    infrastructure: { target: profile.defaultTarget },
    supabase: {
      projectUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      projectRef: deriveSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL),
    },
    manifest,
    createdAt: now,
    updatedAt: now,
  };
}
