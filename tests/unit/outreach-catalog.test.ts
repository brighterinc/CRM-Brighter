import { describe, expect, it } from "vitest";

import {
  getOutreachAiCapabilityDefinition,
  getOutreachCadenceStepTypeDefinition,
  getOutreachCampaignTypeDefinition,
  getOutreachResponseClassificationDefinition,
  getOutreachThrottlingPolicyDefinition,
  OUTREACH_AI_CAPABILITY_CATALOG,
  OUTREACH_CADENCE_STEP_TYPE_CATALOG,
  OUTREACH_CAMPAIGN_TYPE_CATALOG,
  OUTREACH_RESPONSE_CLASSIFICATION_CATALOG,
  resolveApplicableCampaignTypes,
} from "@/lib/outreach/catalog";

describe("OUTREACH_CAMPAIGN_TYPE_CATALOG", () => {
  it("toda entrada exige o módulo automation.campaigns", () => {
    for (const entry of OUTREACH_CAMPAIGN_TYPE_CATALOG) {
      expect(entry.requiredModules).toContain("automation.campaigns");
      expect(entry.status).toBe("planned");
      expect(entry.simulatedOnly).toBe(true);
    }
  });

  it("getOutreachCampaignTypeDefinition encontra por id e devolve undefined pra id desconhecido", () => {
    expect(getOutreachCampaignTypeDefinition("whatsapp_broadcast_cadence")?.channel).toBe("whatsapp");
    expect(getOutreachCampaignTypeDefinition("inexistente")).toBeUndefined();
  });
});

describe("OUTREACH_CADENCE_STEP_TYPE_CATALOG", () => {
  it("transfer_to_human exige a capacidade de IA recommend_handoff", () => {
    const step = getOutreachCadenceStepTypeDefinition("transfer_to_human");
    expect(step?.requiresAiCapability).toBe("recommend_handoff");
  });

  it("delay não suporta template", () => {
    const step = getOutreachCadenceStepTypeDefinition("delay");
    expect(step?.supportsTemplate).toBe(false);
  });

  it("cobre os 10 tipos de etapa pedidos no domínio", () => {
    const ids = OUTREACH_CADENCE_STEP_TYPE_CATALOG.map((s) => s.id).sort();
    expect(ids).toEqual(
      ["assign_owner", "condition", "create_task", "delay", "email", "end", "message", "transfer_to_human", "update_pipeline", "wait_for_reply"].sort(),
    );
  });
});

describe("OUTREACH_RESPONSE_CLASSIFICATION_CATALOG", () => {
  it("opt_out para a cadência mas não recomenda handoff comercial", () => {
    const def = getOutreachResponseClassificationDefinition("opt_out");
    expect(def?.stopsCadence).toBe(true);
    expect(def?.recommendsHandoff).toBe(false);
  });

  it("interested para a cadência e recomenda handoff", () => {
    const def = getOutreachResponseClassificationDefinition("interested");
    expect(def?.stopsCadence).toBe(true);
    expect(def?.recommendsHandoff).toBe(true);
  });

  it("cobre as 10 classificações pedidas no domínio", () => {
    expect(OUTREACH_RESPONSE_CLASSIFICATION_CATALOG).toHaveLength(10);
  });
});

describe("OUTREACH_AI_CAPABILITY_CATALOG", () => {
  it("toda capacidade é simulatedOnly e recomenda humano em baixa confiança", () => {
    for (const cap of OUTREACH_AI_CAPABILITY_CATALOG) {
      expect(cap.simulatedOnly).toBe(true);
      expect(cap.lowConfidenceRecommendsHuman).toBe(true);
      expect(cap.requiresModule).toBe("ai.agents");
    }
  });

  it("getOutreachAiCapabilityDefinition encontra classify_response", () => {
    expect(getOutreachAiCapabilityDefinition("classify_response")?.name).toBe("Classificar resposta");
  });
});

describe("OUTREACH_THROTTLING_POLICY_CATALOG", () => {
  it("whatsapp_campaign reflete os valores reais documentados (5s, não inventados)", () => {
    const policy = getOutreachThrottlingPolicyDefinition("whatsapp_campaign");
    expect(policy?.minDelaySeconds).toBe(5);
  });

  it("whatsapp_one_to_one é mais rápido que whatsapp_campaign (1:1 vs campanha)", () => {
    const oneToOne = getOutreachThrottlingPolicyDefinition("whatsapp_one_to_one")!;
    const campaign = getOutreachThrottlingPolicyDefinition("whatsapp_campaign")!;
    expect(oneToOne.minDelaySeconds).toBeLessThan(campaign.minDelaySeconds);
  });
});

describe("resolveApplicableCampaignTypes", () => {
  it("filtra por módulo habilitado e plano de implantação", () => {
    const applicable = resolveApplicableCampaignTypes(["automation.campaigns", "channel.whatsapp"], "dedicated");
    expect(applicable.map((c) => c.id)).toContain("whatsapp_broadcast_cadence");
    expect(applicable.map((c) => c.id)).not.toContain("email_broadcast_cadence");
  });

  it("nenhum módulo habilitado → nenhum tipo aplicável", () => {
    expect(resolveApplicableCampaignTypes([], "dedicated")).toEqual([]);
  });
});
