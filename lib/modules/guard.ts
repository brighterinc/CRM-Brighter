/**
 * Proteção de rota reutilizável pro Module Engine.
 *
 * Chame DEPOIS de `requireAuth()` em Server Components / route handlers —
 * `requireModule` não resolve autenticação, só disponibilidade de módulo, e
 * não deve derrubar sessões válidas nem renderizar a feature parcialmente.
 *
 * Módulo desligado → 404 nativo (`notFound()`), mesmo padrão já usado em
 * `app/app/settings/atualizacao/page.tsx` pra "esta página não faz parte do
 * produto pra este viewer".
 */
import { notFound } from "next/navigation";
import { isModuleEnabled } from "./runtime";

export function requireModule(moduleId: string): void {
  if (!isModuleEnabled(moduleId)) {
    notFound();
  }
}
