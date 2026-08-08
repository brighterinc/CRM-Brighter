import { describe, expect, it } from "vitest";

import {
  FakeMarketplaceBillingAdapter,
  FakeMarketplaceProvisioningAdapter,
  FakeModuleActivationAdapter,
  NoopMarketplaceBillingAdapter,
  NoopMarketplaceProvisioningAdapter,
  NoopModuleActivationAdapter,
} from "@/lib/marketplace/adapters";

describe("Noop adapters", () => {
  it("nunca fingem sucesso real — sempre simulated: true com mensagem no-op", async () => {
    const activation = await new NoopModuleActivationAdapter().activate("ai.agents", "activated");
    expect(activation.simulated).toBe(true);
    expect(activation.message).toContain("no-op");

    const billing = await new NoopMarketplaceBillingAdapter().checkEntitlement("ai.agents");
    expect(billing.simulated).toBe(true);
    expect(billing.message).toContain("no-op");

    const provisioning = await new NoopMarketplaceProvisioningAdapter().attachActivationSteps("ai.agents");
    expect(provisioning.simulated).toBe(true);
    expect(provisioning.message).toContain("no-op");
  });
});

describe("Fake adapters", () => {
  it("são determinísticos — mesmo input produz mesmo resultado, sempre simulated: true", async () => {
    const a1 = await new FakeModuleActivationAdapter().activate("channel.whatsapp", "activated");
    const a2 = await new FakeModuleActivationAdapter().activate("channel.whatsapp", "activated");
    expect(a1).toEqual(a2);
    expect(a1.simulated).toBe(true);

    const b1 = await new FakeMarketplaceBillingAdapter().checkEntitlement("ai.agents");
    expect(b1.simulated).toBe(true);
    expect(b1.metadata).toEqual({ moduleId: "ai.agents" });

    const p1 = await new FakeMarketplaceProvisioningAdapter().attachActivationSteps("ai.agents");
    expect(p1.simulated).toBe(true);
  });
});
