/**
 * Fábrica do registry padrão — nunca um singleton global mutável (spec §5).
 * Cada chamador (CLI, página admin, teste) monta a própria instância aqui,
 * sempre com os 14 blueprints registrados na mesma ordem canônica.
 */
import { ProvisioningAdapterRegistry } from "../registry";
import { ChatwootProvisioningProviderAdapter } from "./chatwoot";
import { DnsProvisioningProviderAdapter } from "./dns";
import { DockerProvisioningProviderAdapter } from "./docker";
import { EmailProvisioningProviderAdapter } from "./email";
import { EvolutionProvisioningProviderAdapter } from "./evolution";
import { FakeProvisioningProviderAdapter } from "./fake";
import { NoopProvisioningProviderAdapter } from "./noop";
import { RedisProvisioningProviderAdapter } from "./redis";
import { ReverseProxyProvisioningProviderAdapter } from "./reverse-proxy";
import { SupabaseProvisioningProviderAdapter } from "./supabase";
import { VercelProvisioningProviderAdapter } from "./vercel";
import { VpsProvisioningProviderAdapter } from "./vps";
import { WahaProvisioningProviderAdapter } from "./waha";
import { WhatsappProvisioningProviderAdapter } from "./whatsapp";

export {
  ChatwootProvisioningProviderAdapter,
  DnsProvisioningProviderAdapter,
  DockerProvisioningProviderAdapter,
  EmailProvisioningProviderAdapter,
  EvolutionProvisioningProviderAdapter,
  FakeProvisioningProviderAdapter,
  NoopProvisioningProviderAdapter,
  RedisProvisioningProviderAdapter,
  ReverseProxyProvisioningProviderAdapter,
  SupabaseProvisioningProviderAdapter,
  VercelProvisioningProviderAdapter,
  VpsProvisioningProviderAdapter,
  WahaProvisioningProviderAdapter,
  WhatsappProvisioningProviderAdapter,
};

export function createDefaultProvisioningAdapterRegistry(): ProvisioningAdapterRegistry {
  const registry = new ProvisioningAdapterRegistry();
  registry.registerAdapter(NoopProvisioningProviderAdapter);
  registry.registerAdapter(FakeProvisioningProviderAdapter);
  registry.registerAdapter(SupabaseProvisioningProviderAdapter);
  registry.registerAdapter(VercelProvisioningProviderAdapter);
  registry.registerAdapter(DnsProvisioningProviderAdapter);
  registry.registerAdapter(VpsProvisioningProviderAdapter);
  registry.registerAdapter(DockerProvisioningProviderAdapter);
  registry.registerAdapter(ReverseProxyProvisioningProviderAdapter);
  registry.registerAdapter(RedisProvisioningProviderAdapter);
  registry.registerAdapter(EmailProvisioningProviderAdapter);
  registry.registerAdapter(WhatsappProvisioningProviderAdapter);
  registry.registerAdapter(ChatwootProvisioningProviderAdapter);
  registry.registerAdapter(EvolutionProvisioningProviderAdapter);
  registry.registerAdapter(WahaProvisioningProviderAdapter);
  return registry;
}
