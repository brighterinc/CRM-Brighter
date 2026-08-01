/**
 * Marca da instalação — nome, logo e identidade de contato configuráveis pelo
 * `.env`, SEM rebuild.
 *
 * Por que existe: quem instala o DeskcommCRM para clientes (agência, revendedor)
 * precisa da própria marca na interface. Fazer isso editando o código quebraria o
 * caminho de atualização — `update.sh` puxa a imagem nova e o patch local se perde,
 * que é exatamente a dor nº 1 de quem hospeda o próprio sistema. Configuração em
 * `.env` sobrevive a toda atualização.
 *
 * Vale para servidor (`process.env`) e navegador (`window.__PUBLIC_ENV__`, injetado
 * em runtime pelo `<PublicEnvScript/>`) — mesmo modelo de `lib/sentry/dsn.ts`.
 * Nem todo campo chega ao navegador: `legalName`, `fromName` e `fromEmail` só
 * aparecem em PDF/e-mail gerados no servidor, então não são expostos em
 * `PublicEnvScript` — ver `app/public-env-script.tsx`.
 *
 * As variáveis NÃO são `NEXT_PUBLIC_*` de propósito: essas são queimadas no bundle
 * durante o `next build`, e o self-hoster roda uma imagem PRÉ-BUILDADA. A marca dele
 * nunca apareceria. É o mesmo motivo pelo qual a URL do Supabase é injetada em
 * runtime em vez de lida do bundle.
 */

export const DEFAULT_APP_NAME = "DeskcommCRM";

export type Branding = {
  /** Nome exibido na interface e nos títulos de página. */
  name: string;
  /** URL do logo, ou `null` quando a marca deve aparecer como texto. */
  logoUrl: string | null;
  /** Primeira letra do nome — usada onde só cabe um caractere (sidebar recolhida). */
  initial: string;
  /** E-mail de suporte exibido ao usuário final, ou `null` quando não configurado. */
  supportEmail: string | null;
  /** Razão social usada em documentos formais (PDF LGPD). Cai em `name` se ausente. */
  legalName: string;
  /** URL institucional, ou `null` quando não configurada. */
  websiteUrl: string | null;
  /** Nome do remetente em e-mails transacionais. Cai em `name` se ausente. */
  fromName: string;
  /** E-mail do remetente em e-mails transacionais, ou `null` quando não configurado. */
  fromEmail: string | null;
  /** URL do favicon, ou `null` quando deve usar o padrão do build. */
  faviconUrl: string | null;
};

/** Entradas cruas (env var ou runtime) que alimentam {@link resolveBranding}. */
export type BrandingRaw = {
  name?: string | null;
  logoUrl?: string | null;
  supportEmail?: string | null;
  legalName?: string | null;
  websiteUrl?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  faviconUrl?: string | null;
};

function normalized(value: string | undefined | null): string {
  return (value ?? "").trim();
}

/** String normalizada, ou `null` quando vazia — para campos sem fallback textual. */
function normalizedOrNull(value: string | undefined | null): string | null {
  const v = normalized(value);
  return v.length > 0 ? v : null;
}

/**
 * Resolve a marca a partir dos valores crus. Função pura: recebe a fonte, não a
 * procura — assim o mesmo resolvedor serve servidor, navegador e teste.
 *
 * Valor vazio ou só com espaços cai no padrão. Isso importa porque `.env` gerado
 * por script costuma trazer a chave declarada e vazia (`APP_NAME=`), e tratar isso
 * como "marca sem nome" deixaria a interface em branco.
 *
 * Campos sem valor de instalação óbvio (`supportEmail`, `websiteUrl`, `fromEmail`,
 * `faviconUrl`) caem em `null` — nunca inventamos um endereço ou URL. `legalName`
 * e `fromName` caem no `name` resolvido, que já tem fallback seguro.
 */
export function resolveBranding(raw: BrandingRaw): Branding {
  const name = normalized(raw.name) || DEFAULT_APP_NAME;
  return {
    name,
    logoUrl: normalizedOrNull(raw.logoUrl),
    // Spread em vez de [0]: nome começando com emoji ou acento composto quebraria
    // no meio do code point e renderizaria caractere inválido.
    initial: ([...name][0] ?? DEFAULT_APP_NAME[0]!).toUpperCase(),
    supportEmail: normalizedOrNull(raw.supportEmail),
    legalName: normalized(raw.legalName) || name,
    websiteUrl: normalizedOrNull(raw.websiteUrl),
    fromName: normalized(raw.fromName) || name,
    fromEmail: normalizedOrNull(raw.fromEmail),
    faviconUrl: normalizedOrNull(raw.faviconUrl),
  };
}

/** Lê a marca da fonte correta em cada lado da fronteira servidor/navegador. */
export function branding(): Branding {
  if (typeof window !== "undefined") {
    const runtime = window.__PUBLIC_ENV__;
    return resolveBranding({
      name: runtime?.APP_NAME,
      logoUrl: runtime?.APP_LOGO_URL,
      supportEmail: runtime?.APP_SUPPORT_EMAIL,
      websiteUrl: runtime?.APP_WEBSITE_URL,
      faviconUrl: runtime?.APP_FAVICON_URL,
    });
  }
  return resolveBranding({
    name: process.env.APP_NAME,
    logoUrl: process.env.APP_LOGO_URL,
    supportEmail: process.env.APP_SUPPORT_EMAIL,
    legalName: process.env.APP_LEGAL_NAME,
    websiteUrl: process.env.APP_WEBSITE_URL,
    fromName: process.env.APP_FROM_NAME,
    fromEmail: process.env.APP_FROM_EMAIL,
    faviconUrl: process.env.APP_FAVICON_URL,
  });
}
