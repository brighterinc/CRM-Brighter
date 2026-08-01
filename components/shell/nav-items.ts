/**
 * Itens de navegação da sidebar + lógica pura de visibilidade.
 *
 * Isolado de Sidebar.tsx de propósito: Sidebar.tsx importa `toggleSidebar`
 * (Server Action) que puxa `lib/env.ts` transitivamente — inofensivo em
 * runtime, mas torna qualquer teste que só precisa da lógica pura de
 * visibilidade refém da validação completa de env vars. Este arquivo não
 * importa nada server-only, então é seguro testar isolado (mesmo padrão de
 * `visibleInboxTabs` em `components/inbox/InboxFilters.tsx`).
 */
import {
  Kanban,
  Users,
  UsersThree,
  Gear,
  Inbox,
  ScalesSimple,
  Robot,
  Brain,
  PlugsConnected,
  ChartBar,
  ChartLineUp,
  WebhooksLogo,
  FlowArrow,
  FileText,
  ClockCountdown,
  PuzzlePiece,
  Signpost,
} from "@/lib/ui/icons";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

export interface NavItem {
  href: string;
  label: string;
  icon: PhosphorIcon;
  permission?: string;
  /** Módulo do catálogo (lib/modules/catalog.ts) que precisa estar ligado pra este item aparecer. */
  moduleId?: string;
  healthDot?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/app/inbox", label: "Inbox", icon: Inbox },
  { href: "/app/radar", label: "Radar", icon: ClockCountdown },
  { href: "/app/connections", label: "Conexões", icon: PlugsConnected, healthDot: true, moduleId: "channel.whatsapp" },
  { href: "/app/kanban", label: "Kanban", icon: Kanban },
  { href: "/app/contacts", label: "Contatos", icon: Users },
  { href: "/app/team", label: "Equipe", icon: UsersThree },
  { href: "/app/metrics", label: "Desempenho", icon: ChartBar, moduleId: "analytics.metrics" },
  { href: "/app/templates", label: "Templates", icon: FileText },
  {
    href: "/app/lgpd/requests",
    label: "LGPD",
    icon: ScalesSimple,
    permission: "lgpd.execute_redact",
    moduleId: "compliance.lgpd",
  },
  { href: "/app/ai/agents", label: "Agentes IA", icon: Robot, permission: "ai.agents.view", moduleId: "ai.agents" },
  { href: "/app/ai/routers", label: "Roteadores", icon: Signpost, permission: "ai.routers.view" },
  {
    href: "/app/ai/followups",
    label: "Follow-ups",
    icon: FlowArrow,
    permission: "ai.agents.view",
    moduleId: "automation.followups",
  },
  {
    href: "/app/ai/memory",
    label: "Memória da IA",
    icon: Brain,
    permission: "ai.memory.view",
    moduleId: "ai.memory",
  },
  { href: "/app/ai/skills", label: "Skills da IA", icon: PuzzlePiece, permission: "ai.skills.view" },
  { href: "/app/ai/evolution", label: "Evolução da IA", icon: ChartLineUp, permission: "ai.evolution.view" },
  {
    href: "/app/webhooks",
    label: "Webhooks",
    icon: WebhooksLogo,
    permission: "webhooks.manage",
    moduleId: "automation.webhooks",
  },
  { href: "/app/settings", label: "Configurações", icon: Gear },
];

/**
 * Um item some se a permissão faltar OU se o módulo dono estiver desligado
 * nesta instalação (Module Engine).
 */
export function isNavItemVisible(
  item: NavItem,
  ctx: { permissions: Record<string, boolean>; enabledModuleIds: string[] },
): boolean {
  if (item.permission && !ctx.permissions[item.permission]) return false;
  if (item.moduleId && !ctx.enabledModuleIds.includes(item.moduleId)) return false;
  return true;
}
