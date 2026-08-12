/**
 * `DatabaseSecretReferenceRepository` — implementação real (Supabase) do
 * `CredentialsVault`. Mesmo assim, NUNCA guarda valor de segredo: a tabela
 * `control_plane_secret_references` só tem `reference`/`type`/`provider`/
 * `vault_provider`/`vault_key`/`version`/`status`/datas (ver migration
 * `0098_control_plane_persistence`). `vaultProvider` desta fase é sempre
 * `"noop" | "in_memory" | "database_placeholder"` — nenhum guarda o valor
 * de verdade; um `vaultProvider` real (ex.: Postgres `pgp_sym_encrypt`, como
 * já existe pra OAuth do Nuvemshop em `fn_encrypt_oauth`/`fn_decrypt_oauth`)
 * é trabalho de uma fase futura, documentado em
 * `docs/control-plane-persistence/runtime-boundary.md`.
 *
 * Sem `organization_id` pra filtrar (a tabela não é tenant-aware — é
 * plataforma, RLS restringe a `fn_is_platform_admin()`), mas o mesmo cuidado
 * de `lib/lgpd/repository.ts` se aplica: quem CHAMA este repository é
 * responsável por já ter confirmado platform-admin antes (`requirePlatformAdmin()`
 * na UI, `requireRole(..., { allowPlatformAdmin: true })` numa futura rota).
 */
import { createAdminClient } from "@/lib/supabase/admin";

import { secretReferenceDomainToInsertRow, secretReferenceRowToMetadata, type ControlPlaneSecretReferenceRow } from "../mappers/persistence";
import { assertSafePersistencePayload } from "../safe-persistence";
import {
  VaultReferenceNotFoundError,
  type CreateSecretReferenceInput,
  type CredentialsVault,
  type SecretReferenceMetadata,
  type SecretReferenceReader,
} from "./types";

const TABLE = "control_plane_secret_references";

export class DatabaseSecretReferenceRepository implements CredentialsVault, SecretReferenceReader {
  async createReference(input: CreateSecretReferenceInput): Promise<SecretReferenceMetadata> {
    assertSafePersistencePayload(input, "DatabaseSecretReferenceRepository.createReference");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .insert(secretReferenceDomainToInsertRow(input))
      .select("*")
      .single();
    if (error) throw new Error(`[control-plane-persistence] createReference failed: ${error.message}`);
    return secretReferenceRowToMetadata(data as ControlPlaneSecretReferenceRow);
  }

  async resolveReferenceMetadata(id: string): Promise<SecretReferenceMetadata | null> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`[control-plane-persistence] resolveReferenceMetadata failed: ${error.message}`);
    return data ? secretReferenceRowToMetadata(data as ControlPlaneSecretReferenceRow) : null;
  }

  async rotateReference(id: string): Promise<SecretReferenceMetadata> {
    const existing = await this.resolveReferenceMetadata(id);
    if (!existing) throw new VaultReferenceNotFoundError(id);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .update({ version: existing.version + 1, status: "active", rotated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`[control-plane-persistence] rotateReference failed: ${error.message}`);
    return secretReferenceRowToMetadata(data as ControlPlaneSecretReferenceRow);
  }

  async revokeReference(id: string): Promise<SecretReferenceMetadata> {
    const existing = await this.resolveReferenceMetadata(id);
    if (!existing) throw new VaultReferenceNotFoundError(id);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`[control-plane-persistence] revokeReference failed: ${error.message}`);
    return secretReferenceRowToMetadata(data as ControlPlaneSecretReferenceRow);
  }

  async validateReference(id: string): Promise<{ valid: boolean; errors: string[] }> {
    const existing = await this.resolveReferenceMetadata(id);
    if (!existing) return { valid: false, errors: [`reference "${id}" não encontrada`] };
    if (existing.status === "revoked") return { valid: false, errors: ["reference revogada"] };
    return { valid: true, errors: [] };
  }

  /** Fora de `CredentialsVault` de propósito (ver `SecretReferenceReader`) — só pra listagem da admin UI. */
  async listByInstallation(installationId: string): Promise<SecretReferenceMetadata[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .select("*")
      .eq("installation_id", installationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`[control-plane-persistence] listByInstallation failed: ${error.message}`);
    return (data as ControlPlaneSecretReferenceRow[]).map(secretReferenceRowToMetadata);
  }
}
