/**
 * Catálogo tipado de capabilities por provider — Provisioning Adapters
 * Foundation v1. Cada entrada só DECLARA metadado (o que um adapter diria
 * que sabe fazer) — nenhuma capability aqui executa nada. `realExecutionAvailable`
 * é sempre `false` nesta Foundation (reservado pra fase futura).
 *
 * `supportedPlans` reflete onde a etapa correspondente do Provisioning
 * Engine (`lib/provisioning/catalog.ts`) de fato aparece — nunca inventado
 * independente do catálogo de etapas.
 */
import type { ProvisioningAdapterCapability, ProvisioningProvider } from "./types";

const ALL_PLANS = ["lite", "pro", "dedicated"] as const;
const LITE_PRO = ["lite", "pro"] as const;
const DEDICATED_ONLY = ["dedicated"] as const;

function cap(
  def: Omit<ProvisioningAdapterCapability, "id" | "realExecutionAvailable">,
): ProvisioningAdapterCapability {
  return { ...def, id: `${def.provider}.${def.operation}`, realExecutionAvailable: false };
}

export const PROVISIONING_ADAPTER_CAPABILITY_CATALOG: ProvisioningAdapterCapability[] = [
  // --- noop / fake — genéricos, cobrem qualquer operação em teste --------
  cap({
    provider: "noop",
    operation: "simulate",
    description: "No-op — não faz nada, sempre reporta sucesso simulado.",
    supportedPlans: [...ALL_PLANS],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "fake",
    operation: "simulate",
    description: "Determinístico e configurável — usado só em teste/simulação.",
    supportedPlans: [...ALL_PLANS],
    // Declaração de exemplo pra provar o fluxo de integração com a Provider
    // Credentials Runtime (`lib/provider-credentials-runtime/adapter-integration.ts`)
    // sem depender de nenhum provider real — ver `resolveCredentialRequirementForAdapter`.
    requiredCredentialPurpose: "api_call",
    requiredSecretType: "api_key",
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),

  // --- Supabase — aplica a todos os planos (database+auth mandatórios) ---
  cap({
    provider: "supabase",
    operation: "project.create",
    description: "Criaria o projeto Supabase (Auth + Postgres) desta instalação.",
    supportedPlans: [...ALL_PLANS],
    requiredInfra: ["database"],
    requiredCredentialPurpose: "deploy",
    requiredSecretType: "api_key",
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "supabase",
    operation: "auth.configure",
    description: "Configuraria provedores e políticas de autenticação do projeto Supabase.",
    supportedPlans: [...ALL_PLANS],
    requiredInfra: ["auth"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "supabase",
    operation: "auth.link",
    description: "Ligaria a aplicação ao Supabase Auth já configurado (cookies, sessão, MFA).",
    supportedPlans: [...ALL_PLANS],
    requiredInfra: ["auth"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "supabase",
    operation: "database.prepare",
    description: "Aplicaria o baseline versionado (RLS, extensões, tabelas tenant-aware).",
    supportedPlans: [...ALL_PLANS],
    requiredInfra: ["database"],
    requiredCredentialPurpose: "database_admin",
    requiredSecretType: "database_password",
    supportsDryRun: true,
    supportsRollbackPreview: false,
  }),
  cap({
    provider: "supabase",
    operation: "database.policies",
    description: "Conferiria RLS e políticas de isolamento por organização.",
    supportedPlans: [...ALL_PLANS],
    requiredInfra: ["database"],
    supportsDryRun: true,
    supportsRollbackPreview: false,
  }),
  cap({
    provider: "supabase",
    operation: "storage.configure",
    description: "Criaria o bucket de mídia privado e as regras de acesso.",
    supportedPlans: [...ALL_PLANS],
    requiredInfra: ["storage"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "supabase",
    operation: "edge_functions.prepare",
    description: "Prepararia as edge functions exigidas pela instalação.",
    supportedPlans: [...ALL_PLANS],
    requiredInfra: ["edgeFunctions"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),

  // --- Vercel — frontend gerenciado, só Lite/Pro --------------------------
  cap({
    provider: "vercel",
    operation: "project.create",
    description: "Criaria o projeto de frontend hospedado na Vercel.",
    supportedPlans: [...LITE_PRO],
    requiredCredentialPurpose: "deploy",
    requiredSecretType: "api_key",
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "vercel",
    operation: "env.configure",
    description: "Aplicaria as variáveis de ambiente do projeto de frontend.",
    supportedPlans: [...LITE_PRO],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "vercel",
    operation: "deployment.prepare",
    description: "Prepararia o build do frontend para publicação.",
    supportedPlans: [...LITE_PRO],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "vercel",
    operation: "domain.attach",
    description: "Anexaria o domínio do cliente ao projeto de frontend (SSL emitido automaticamente pela plataforma).",
    supportedPlans: [...LITE_PRO],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),

  // --- DNS — só quando o target é VPS (self-host dedicado) ----------------
  cap({
    provider: "dns",
    operation: "record.plan",
    description: "Planejaria o apontamento do domínio do cliente para o target de implantação.",
    supportedPlans: [...DEDICATED_ONLY],
    requiredCredentialPurpose: "dns_write",
    requiredSecretType: "api_key",
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "dns",
    operation: "domain.validate",
    description: "Validaria a propriedade e propagação do domínio do cliente.",
    supportedPlans: [...DEDICATED_ONLY],
    supportsDryRun: true,
    supportsRollbackPreview: false,
  }),
  cap({
    provider: "dns",
    operation: "cname.plan",
    description: "Planejaria registro CNAME.",
    supportedPlans: [...DEDICATED_ONLY],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "dns",
    operation: "txt.plan",
    description: "Planejaria registro TXT (verificação/SPF).",
    supportedPlans: [...DEDICATED_ONLY],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),

  // --- VPS — só Dedicated --------------------------------------------------
  cap({
    provider: "vps",
    operation: "server.validate",
    description: "Validaria/reservaria a VPS dedicada desta instalação.",
    supportedPlans: [...DEDICATED_ONLY],
    supportsDryRun: true,
    // Decisão deliberada — mesmo espírito de `lib/provisioning/catalog.ts`
    // (`prepare_vps.supportsRollback: false`): recurso caro e
    // potencialmente compartilhado, nunca sugerir remoção automática.
    supportsRollbackPreview: false,
  }),
  cap({
    provider: "vps",
    operation: "filesystem.prepare",
    description: "Prepararia estrutura de diretórios e permissões na VPS.",
    supportedPlans: [...DEDICATED_ONLY],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "vps",
    operation: "service.plan",
    description: "Planejaria serviços de sistema (worker, scheduler) na VPS.",
    supportedPlans: [...DEDICATED_ONLY],
    requiredInfra: ["worker", "scheduler"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),

  // --- Docker — só Dedicated ------------------------------------------------
  cap({
    provider: "docker",
    operation: "compose.validate",
    description: "Validaria o arquivo `docker-compose` e a instalação do runtime.",
    supportedPlans: [...DEDICATED_ONLY],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "docker",
    operation: "container.plan",
    description: "Planejaria os containers exigidos pela instalação.",
    supportedPlans: [...DEDICATED_ONLY],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "docker",
    operation: "network.plan",
    description: "Planejaria a rede Docker interna da instalação.",
    supportedPlans: [...DEDICATED_ONLY],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "docker",
    operation: "volume.plan",
    description: "Planejaria volumes persistentes da instalação.",
    supportedPlans: [...DEDICATED_ONLY],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),

  // --- Reverse Proxy — só Dedicated ------------------------------------------
  cap({
    provider: "reverse_proxy",
    operation: "route.plan",
    description: "Planejaria rota do proxy reverso (Caddy) para a aplicação.",
    supportedPlans: [...DEDICATED_ONLY],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "reverse_proxy",
    operation: "tls.plan",
    description: "Planejaria emissão/renovação do certificado SSL do domínio.",
    supportedPlans: [...DEDICATED_ONLY],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),

  // --- Redis — só Dedicated --------------------------------------------------
  cap({
    provider: "redis",
    operation: "instance.plan",
    description: "Planejaria a instância Redis/serverless-redis-http para rate limit e filas.",
    supportedPlans: [...DEDICATED_ONLY],
    requiredInfra: ["redis"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "redis",
    operation: "connection.validate",
    description: "Validaria a conectividade planejada com a instância Redis.",
    supportedPlans: [...DEDICATED_ONLY],
    requiredInfra: ["redis"],
    supportsDryRun: true,
    supportsRollbackPreview: false,
  }),

  // --- Email — gating por infra do manifesto, não por plano fixo ---------
  cap({
    provider: "email",
    operation: "provider.configure",
    description: "Configuraria o provedor de e-mail transacional.",
    supportedPlans: [...ALL_PLANS],
    requiredInfra: ["email"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "email",
    operation: "sender.verify",
    description: "Verificaria o domínio/remetente de e-mail transacional.",
    supportedPlans: [...ALL_PLANS],
    requiredInfra: ["email"],
    supportsDryRun: true,
    supportsRollbackPreview: false,
  }),

  // --- WhatsApp (canal, genérico) ------------------------------------------
  cap({
    provider: "whatsapp",
    operation: "channel.plan",
    description: "Planejaria a conexão do número de WhatsApp do cliente.",
    supportedPlans: [...ALL_PLANS],
    requiredModules: ["channel.whatsapp"],
    requiredInfra: ["whatsapp"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "whatsapp",
    operation: "inbox.plan",
    description: "Planejaria a caixa de entrada vinculada ao canal WhatsApp.",
    supportedPlans: [...ALL_PLANS],
    requiredModules: ["channel.whatsapp"],
    requiredInfra: ["whatsapp"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),

  // --- Chatwoot — blueprint registrado, sem etapa própria no catálogo hoje ---
  cap({
    provider: "chatwoot",
    operation: "account.plan",
    description: "Planejaria a conta Chatwoot desta instalação.",
    supportedPlans: [...ALL_PLANS],
    requiredModules: ["channel.whatsapp"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "chatwoot",
    operation: "inbox.plan",
    description: "Planejaria a inbox Chatwoot vinculada ao canal.",
    supportedPlans: [...ALL_PLANS],
    requiredModules: ["channel.whatsapp"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),

  // --- Evolution — blueprint registrado, sem etapa própria no catálogo hoje --
  cap({
    provider: "evolution",
    operation: "instance.plan",
    description: "Planejaria a instância Evolution API.",
    supportedPlans: [...ALL_PLANS],
    requiredModules: ["channel.whatsapp"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
  cap({
    provider: "evolution",
    operation: "webhook.plan",
    description: "Planejaria o webhook de eventos da instância Evolution.",
    supportedPlans: [...ALL_PLANS],
    requiredModules: ["channel.whatsapp"],
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),

  // --- WAHA — blueprint registrado, sem etapa própria no catálogo hoje ------
  cap({
    provider: "waha",
    operation: "session.plan",
    description: "Planejaria a sessão WAHA (engine NOWEB) desta instalação.",
    supportedPlans: [...ALL_PLANS],
    requiredModules: ["channel.whatsapp"],
    requiredCredentialPurpose: "messaging",
    requiredSecretType: "api_key",
    supportsDryRun: true,
    supportsRollbackPreview: true,
  }),
];

export function listCapabilitiesForProvider(provider: ProvisioningProvider): ProvisioningAdapterCapability[] {
  return PROVISIONING_ADAPTER_CAPABILITY_CATALOG.filter((c) => c.provider === provider);
}

export function findCapability(provider: ProvisioningProvider, operation: string): ProvisioningAdapterCapability | undefined {
  return PROVISIONING_ADAPTER_CAPABILITY_CATALOG.find((c) => c.provider === provider && c.operation === operation);
}
