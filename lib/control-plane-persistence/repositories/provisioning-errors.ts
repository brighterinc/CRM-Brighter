/**
 * `ProvisioningRunNotFoundError` isolado num arquivo próprio, sem NENHUM
 * import — `provisioning.ts` importa `@/lib/supabase/admin` no topo (pra
 * `DatabaseProvisioningRepository`), que valida env vars NA HORA do import.
 * `services.ts` precisa deste erro em runtime (não só como type), e
 * `recordProvisioningStep` roda em contexto CLI/teste in-memory sem `.env`
 * (`pnpm control:persistence`) — importar de `./provisioning` quebraria essa
 * garantia de novo (mesmo motivo do `emitAudit` injetado, ver cabeçalho de
 * `services.ts`). `provisioning.ts` reexporta esta classe pra manter a API
 * pública estável de quem já importava de lá.
 */
export class ProvisioningRunNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`provisioning_run_not_found: ${id}`);
    this.name = "ProvisioningRunNotFoundError";
  }
}
