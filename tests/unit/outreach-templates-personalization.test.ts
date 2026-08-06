import { describe, expect, it } from "vitest";

import { buildAvailableValues, personalizeOutreachContent } from "@/lib/outreach/personalization";
import { detectMissingVariables, extractTemplateVariables, validateTemplate } from "@/lib/outreach/templates";
import type { OutreachPersonalizationContext, OutreachSyntheticContact, OutreachTemplate } from "@/lib/outreach/types";

function template(overrides: Partial<OutreachTemplate> = {}): OutreachTemplate {
  return {
    id: "tpl-1",
    name: "Template teste",
    channel: "whatsapp",
    body: "Oi {{first_name}}, tudo bem?",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function contact(overrides: Partial<OutreachSyntheticContact> = {}): OutreachSyntheticContact {
  return {
    id: "c1",
    name: "Ana Paula",
    phoneNumber: "+5511999999999",
    email: "ana@example.invalid",
    tags: [],
    customFields: {},
    isBlocked: false,
    blockedReason: null,
    consent: {},
    ownerUserId: null,
    ...overrides,
  };
}

describe("extractTemplateVariables", () => {
  it("extrai todas as variáveis únicas, ignorando repetição", () => {
    expect(extractTemplateVariables("Oi {{first_name}}, {{first_name}} tudo bem? {{company_name}}")).toEqual(["first_name", "company_name"]);
  });

  it("template sem variável devolve array vazio", () => {
    expect(extractTemplateVariables("Oi, tudo bem?")).toEqual([]);
  });
});

describe("validateTemplate", () => {
  it("template válido com variável conhecida", () => {
    const result = validateTemplate(template());
    expect(result.valid).toBe(true);
  });

  it("template vazio é inválido", () => {
    const result = validateTemplate(template({ body: "   " }));
    expect(result.valid).toBe(false);
    expect(result.isEmpty).toBe(true);
  });

  it("variável desconhecida é reportada", () => {
    const result = validateTemplate(template({ body: "Seu token é {{token}}" }));
    expect(result.valid).toBe(false);
    expect(result.unknownVariables).toContain("token");
  });

  it("variável sensível é reportada mesmo se tecnicamente 'custom.*'", () => {
    const result = validateTemplate(template({ body: "Seu CPF é {{custom.cpf}}" }));
    expect(result.sensitiveVariables).toContain("custom.cpf");
    expect(result.valid).toBe(false);
  });

  it("custom.* é uma variável conhecida (não entra em unknownVariables)", () => {
    const result = validateTemplate(template({ body: "Cargo: {{custom.cargo}}" }));
    expect(result.unknownVariables).toEqual([]);
  });
});

describe("detectMissingVariables", () => {
  it("reporta variáveis sem valor disponível", () => {
    const missing = detectMissingVariables("Oi {{first_name}}, {{company_name}}", { first_name: "Ana" });
    expect(missing).toEqual(["company_name"]);
  });
});

describe("personalizeOutreachContent", () => {
  it("substitui variável conhecida pelo valor do contato", () => {
    const ctx: OutreachPersonalizationContext = { contact: contact() };
    const result = personalizeOutreachContent(template(), ctx);
    expect(result.content).toBe("Oi Ana, tudo bem?");
    expect(result.usedFallback).toBe(false);
    expect(result.missingVariables).toEqual([]);
  });

  it("usa o fallback INTEIRO quando falta valor (nunca substituição parcial)", () => {
    const tpl = template({ body: "Oi {{owner_name}}!", fallbackBody: "Olá! Em breve entraremos em contato." });
    const ctx: OutreachPersonalizationContext = { contact: contact() };
    const result = personalizeOutreachContent(tpl, ctx);
    expect(result.usedFallback).toBe(true);
    expect(result.content).toBe("Olá! Em breve entraremos em contato.");
  });

  it("sem fallback, deixa o placeholder literal e reporta missingVariables", () => {
    const tpl = template({ body: "Oi {{owner_name}}!" });
    const ctx: OutreachPersonalizationContext = { contact: contact() };
    const result = personalizeOutreachContent(tpl, ctx);
    expect(result.usedFallback).toBe(false);
    expect(result.content).toBe("Oi {{owner_name}}!");
    expect(result.missingVariables).toEqual(["owner_name"]);
  });

  it("first_name deriva do primeiro nome de full_name do contato", () => {
    const values = buildAvailableValues("{{first_name}}", { contact: contact({ name: "João Pedro" }) });
    expect(values.first_name).toBe("João");
  });

  it("custom.* lê de customFields do contexto de personalização", () => {
    const ctx: OutreachPersonalizationContext = { contact: contact(), customFields: { cargo: "CEO" } };
    const result = personalizeOutreachContent(template({ body: "Cargo: {{custom.cargo}}" }), ctx);
    expect(result.content).toBe("Cargo: CEO");
  });
});
