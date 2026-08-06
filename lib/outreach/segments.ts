/**
 * Segmentação — Outreach & AI Cadence Engine, Foundation v1.
 *
 * `evaluateContactAgainstSegment` opera só sobre `OutreachSyntheticContact`
 * (nunca consulta banco real). Espelha os campos reais de `Contact`
 * (`lib/types/contacts.ts`) que importam pra segmentação — nunca duplica o
 * tipo inteiro.
 */
import type { OutreachSegment, OutreachSegmentFilter, OutreachSyntheticContact } from "./types";

function readField(contact: OutreachSyntheticContact, field: string): unknown {
  if (field === "tags") return contact.tags;
  if (field === "name") return contact.name;
  if (field === "phoneNumber") return contact.phoneNumber;
  if (field === "email") return contact.email;
  if (field === "isBlocked") return contact.isBlocked;
  if (field.startsWith("customFields.")) {
    const key = field.slice("customFields.".length);
    return contact.customFields[key];
  }
  return undefined;
}

function matchesFilter(contact: OutreachSyntheticContact, filter: OutreachSegmentFilter): boolean {
  const actual = readField(contact, filter.field);

  switch (filter.op) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "not_exists":
      return actual === undefined || actual === null;
    case "eq":
      return String(actual ?? "") === String(filter.value ?? "");
    case "neq":
      return String(actual ?? "") !== String(filter.value ?? "");
    case "contains":
      if (Array.isArray(actual)) return actual.map(String).includes(String(filter.value ?? ""));
      return String(actual ?? "").includes(String(filter.value ?? ""));
    case "not_contains":
      if (Array.isArray(actual)) return !actual.map(String).includes(String(filter.value ?? ""));
      return !String(actual ?? "").includes(String(filter.value ?? ""));
    case "in": {
      const values = Array.isArray(filter.value) ? filter.value : [];
      return values.includes(String(actual ?? ""));
    }
    case "not_in": {
      const values = Array.isArray(filter.value) ? filter.value : [];
      return !values.includes(String(actual ?? ""));
    }
    default:
      return false;
  }
}

/** Todos os filtros do segmento precisam bater (AND) — nenhum "OR" nesta Foundation. */
export function evaluateContactAgainstSegment(contact: OutreachSyntheticContact, segment: OutreachSegment): boolean {
  if (segment.excludeContactIds.includes(contact.id)) return false;
  return segment.filters.every((filter) => matchesFilter(contact, filter));
}

/** Filtra a lista de contatos sintéticos que casam com o segmento — não aplica exclusões de elegibilidade (isso é `audiences.ts`/`consent.ts`). */
export function matchSegmentAudience(segment: OutreachSegment, contacts: OutreachSyntheticContact[]): OutreachSyntheticContact[] {
  return contacts.filter((c) => evaluateContactAgainstSegment(c, segment));
}

/** Remove contatos com `id` repetido — mantém a primeira ocorrência. */
export function deduplicateAudience(contacts: OutreachSyntheticContact[]): OutreachSyntheticContact[] {
  const seen = new Set<string>();
  const result: OutreachSyntheticContact[] = [];
  for (const contact of contacts) {
    if (seen.has(contact.id)) continue;
    seen.add(contact.id);
    result.push(contact);
  }
  return result;
}
