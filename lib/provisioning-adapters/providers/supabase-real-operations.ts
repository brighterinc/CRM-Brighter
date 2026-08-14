/**
 * Catálogo de operações do Real Supabase Adapter — DIFERENTE do catálogo do
 * blueprint dry-run (`../capabilities.ts`, operações `supabase.*` da
 * Provisioning Adapters Foundation v1). Este catálogo é próprio deste
 * cluster (`supabase-real*.ts`): declara, por operação, se ela tem execução
 * real IMPLEMENTADA nesta etapa (`real_supported`), se só prepara/valida sem
 * chamar rede (`dry_run_only`) ou se é reservada pra uma etapa futura
 * (`planned`). Nenhuma entrada aqui altera o catálogo do blueprint nem os
 * testes que já o cobrem.
 *
 * Prioridade real desta etapa (ver CONTEXTO da task): validar credenciais,
 * validar acesso ao projeto, ler projeto existente. `project.create` fica
 * `dry_run_only` DE PROPÓSITO — mesmo com o gate ligado, nenhum projeto é
 * criado nesta etapa (só o request é preparado/validado). As 4 operações de
 * configuração (`database.prepare`, `auth.configure`, `storage.prepare`,
 * `edge_functions.prepare`) ficam `planned` — sem chamada real ainda.
 */
import type { ProviderCredentialPurpose, ProvisioningProvider, SecretReferenceType } from "@/lib/provider-credentials-runtime/types";

export const SUPABASE_REAL_OPERATIONS = [
  "project.validate",
  "project.create",
  "project.read",
  "project.status",
  "database.prepare",
  "auth.configure",
  "storage.prepare",
  "edge_functions.prepare",
] as const;

export type SupabaseRealOperation = (typeof SUPABASE_REAL_OPERATIONS)[number];

export const SUPABASE_REAL_OPERATION_CLASSIFICATIONS = ["real_supported", "dry_run_only", "planned"] as const;
export type SupabaseRealOperationClassification = (typeof SUPABASE_REAL_OPERATION_CLASSIFICATIONS)[number];

export type SupabaseRealOperationCatalogEntry = {
  operation: SupabaseRealOperation;
  classification: SupabaseRealOperationClassification;
  description: string;
  /** Descrição LÓGICA do endpoint — nunca usado como URL literal fora de `supabase-api.ts`. */
  endpoint: string;
  requiredCredentialPurpose: ProviderCredentialPurpose;
  requiredSecretType: SecretReferenceType;
  /** Campos de `input` exigidos pra esta operação — validado por `supabase-validation.ts`. */
  requiredInputFields: string[];
  supportsRollbackPreview: boolean;
};

export const SUPABASE_REAL_OPERATION_CATALOG: SupabaseRealOperationCatalogEntry[] = [
  {
    operation: "project.validate",
    classification: "real_supported",
    description: "Valida que a credencial resolve e (se projectRef informado) que há acesso ao projeto.",
    endpoint: "GET /v1/projects/{ref?}",
    requiredCredentialPurpose: "deploy",
    requiredSecretType: "api_key",
    requiredInputFields: [],
    supportsRollbackPreview: false,
  },
  {
    operation: "project.read",
    classification: "real_supported",
    description: "Lê o projeto Supabase existente desta instalação.",
    endpoint: "GET /v1/projects/{ref}",
    requiredCredentialPurpose: "deploy",
    requiredSecretType: "api_key",
    requiredInputFields: ["projectRef"],
    supportsRollbackPreview: false,
  },
  {
    operation: "project.status",
    classification: "real_supported",
    description: "Lê o status atual do projeto Supabase (subconjunto de project.read).",
    endpoint: "GET /v1/projects/{ref}",
    requiredCredentialPurpose: "deploy",
    requiredSecretType: "api_key",
    requiredInputFields: ["projectRef"],
    supportsRollbackPreview: false,
  },
  {
    operation: "project.create",
    classification: "dry_run_only",
    description: "Prepararia/validaria o request de criação do projeto — não cria nada nesta etapa.",
    endpoint: "POST /v1/projects (não executado nesta etapa)",
    requiredCredentialPurpose: "deploy",
    requiredSecretType: "api_key",
    requiredInputFields: ["name", "organizationId", "region"],
    supportsRollbackPreview: true,
  },
  {
    operation: "database.prepare",
    classification: "planned",
    description: "Aplicaria o baseline versionado (RLS, extensões, tabelas tenant-aware) — reservado pra etapa futura.",
    endpoint: "n/a — planned",
    requiredCredentialPurpose: "database_admin",
    requiredSecretType: "database_password",
    requiredInputFields: ["projectRef"],
    supportsRollbackPreview: false,
  },
  {
    operation: "auth.configure",
    classification: "planned",
    description: "Configuraria provedores e políticas de autenticação do projeto — reservado pra etapa futura.",
    endpoint: "n/a — planned",
    requiredCredentialPurpose: "deploy",
    requiredSecretType: "api_key",
    requiredInputFields: ["projectRef"],
    supportsRollbackPreview: true,
  },
  {
    operation: "storage.prepare",
    classification: "planned",
    description: "Criaria o bucket de mídia privado e as regras de acesso — reservado pra etapa futura.",
    endpoint: "n/a — planned",
    requiredCredentialPurpose: "deploy",
    requiredSecretType: "api_key",
    requiredInputFields: ["projectRef"],
    supportsRollbackPreview: true,
  },
  {
    operation: "edge_functions.prepare",
    classification: "planned",
    description: "Prepararia as edge functions exigidas pela instalação — reservado pra etapa futura.",
    endpoint: "n/a — planned",
    requiredCredentialPurpose: "deploy",
    requiredSecretType: "api_key",
    requiredInputFields: ["projectRef"],
    supportsRollbackPreview: true,
  },
];

export function findSupabaseRealOperation(operation: string): SupabaseRealOperationCatalogEntry | undefined {
  return SUPABASE_REAL_OPERATION_CATALOG.find((e) => e.operation === operation);
}

export function isSupabaseRealOperation(value: string): value is SupabaseRealOperation {
  return (SUPABASE_REAL_OPERATIONS as readonly string[]).includes(value);
}

/**
 * Requisito de credencial pro `operation` deste catálogo — plugar em
 * `WithProviderCredentialDeps.loadAdapterRequirement` (`provider-credentials-runtime/factory.ts`)
 * quando o chamador quer que `withProviderCredential` valide `purpose`/`secretType`
 * contra ESTE catálogo (em vez do catálogo do blueprint dry-run,
 * `../capabilities.ts`, que não declara `project.validate`/`project.read`/`project.status`).
 */
export function resolveCredentialRequirementForSupabaseRealOperation(
  provider: ProvisioningProvider,
  operation: string,
): { purpose: ProviderCredentialPurpose; secretType?: SecretReferenceType } | null {
  if (provider !== "supabase") return null;
  const entry = findSupabaseRealOperation(operation);
  if (!entry) return null;
  return { purpose: entry.requiredCredentialPurpose, secretType: entry.requiredSecretType };
}
