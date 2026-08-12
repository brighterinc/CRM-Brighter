/**
 * `DatabaseSecretReferenceRepository` mora em `../vault/database.ts` — é a
 * MESMA classe, servindo dois papéis (repository desta lista E backend do
 * `CredentialsVault`, ver `../vault/types.ts`). Reexportada aqui só pra quem
 * navega a pasta `repositories/` esperando encontrar as 7 nomeadas no pedido.
 */
export { DatabaseSecretReferenceRepository } from "../vault/database";
