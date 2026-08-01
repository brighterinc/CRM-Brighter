"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { CaretDoubleLeft, CaretDoubleRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { toggleSidebar } from "@/app/actions/shell/toggleSidebar";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { VersionFooter } from "@/components/shell/VersionFooter";
import { branding } from "@/lib/branding";
import { NAV_ITEMS, isNavItemVisible } from "./nav-items";

export function Sidebar({
  collapsed,
  enabledModuleIds,
}: {
  collapsed: boolean;
  enabledModuleIds: string[];
}) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const canLgpd = usePermission("lgpd.execute_redact");
  const canAiAgents = usePermission("ai.agents.view");
  const canAiRouters = usePermission("ai.routers.view");
  const canAiMemory = usePermission("ai.memory.view");
  const canAiSkills = usePermission("ai.skills.view");
  const canAiEvolution = usePermission("ai.evolution.view");
  const canWebhooks = usePermission("webhooks.manage");

  const permissions: Record<string, boolean> = {
    "lgpd.execute_redact": canLgpd,
    "ai.agents.view": canAiAgents,
    "ai.routers.view": canAiRouters,
    "ai.memory.view": canAiMemory,
    "ai.skills.view": canAiSkills,
    "ai.evolution.view": canAiEvolution,
    "webhooks.manage": canWebhooks,
  };

  const brand = branding();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex items-center border-b px-4 h-14", collapsed ? "justify-center" : "justify-start")}>
        {brand.logoUrl && !collapsed ? (
          // <img> em vez de next/image de propósito: a URL vem do .env de quem hospeda,
          // e next/image exige allowlist de domínios fechada em build — a imagem
          // pré-buildada rejeitaria o domínio do self-hoster. Altura fixa e largura
          // livre porque a arte enviada tem proporção desconhecida; forçar as duas
          // distorceria o logo de quem configurou.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt={brand.name}
            className="h-7 w-auto max-w-[10rem] object-contain"
          />
        ) : (
          <span className={cn("font-semibold tracking-tight", collapsed && "sr-only")}>
            {brand.name}
          </span>
        )}
        {collapsed && (
          <span aria-hidden className="text-lg font-bold text-primary">
            {brand.initial}
          </span>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="Navegação principal">
        {NAV_ITEMS.filter((item) => isNavItemVisible(item, { permissions, enabledModuleIds })).map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                collapsed && "justify-center px-2",
              )}
            >
              <Icon size={18} weight={isActive ? "fill" : "regular"} aria-hidden />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {item.healthDot && (
                <ConnectionHealthDot
                  className={cn(collapsed ? "absolute right-1.5 top-1.5" : "ml-auto")}
                />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-2">
        <VersionFooter collapsed={collapsed} />
        <button
          type="button"
          onClick={() => startTransition(() => toggleSidebar(collapsed))}
          disabled={isPending}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            collapsed && "justify-center px-2",
          )}
          aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
        >
          {collapsed ? <CaretDoubleRight size={14} aria-hidden /> : <CaretDoubleLeft size={14} aria-hidden />}
          {!collapsed && <span>Recolher</span>}
        </button>
      </div>
    </aside>
  );
}
