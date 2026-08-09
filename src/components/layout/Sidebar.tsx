import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  User,
  Car,
  Calendar,
  BarChart3,
  Settings,
  Truck,
  Building2,
  Boxes,
  Briefcase,
  Gauge,
  Network,
  Wallet,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useChatGestorBadge } from "@/hooks/useChat";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Roles de acesso total (gestor_contrato é o novo padrão; admin e gestor_frota são legados)
const FULL_ACCESS = ['gestor_contrato', 'admin', 'gestor_frota'];
const OBRA_ACCESS = [...FULL_ACCESS, 'gestor_obra'];
const ALL_ROLES   = [...OBRA_ACCESS, 'funcionario'];
// Chat: apenas gestor_obra (por obra) e admin — gestor_contrato e gestor_frota sem acesso
const CHAT_ACCESS = ['gestor_obra', 'admin'];

const menuGroups = [
  {
    group: "Principal",
    items: [
      { title: "Dashboard", icon: LayoutDashboard, url: "/", roles: ALL_ROLES },
    ]
  },
  {
    group: "Pessoas",
    items: [
      { title: "Funcionários", icon: Users, url: "/funcionarios", roles: OBRA_ACCESS },
      { title: "Escalas", icon: Calendar, url: "/escalas", roles: OBRA_ACCESS },
    ]
  },
  {
    group: "Frota",
    items: [
      { title: "Veículos Leves", icon: Car, url: "/frota", roles: OBRA_ACCESS },
      { title: "Veículos Pesados", icon: Truck, url: "/veiculos-pesados", roles: OBRA_ACCESS },
    ]
  },
  {
    group: "Projetos",
    items: [
      { title: "Obras", icon: Building2, url: "/obras", roles: OBRA_ACCESS },
      { title: "Fornecedores", icon: Boxes, url: "/fornecedores", roles: OBRA_ACCESS },
      { title: "Fundo Fixo", icon: Wallet, url: "/fundo-fixo", roles: ALL_ROLES },
    ]
  },
  {
    group: "Análises",
    items: [
      { title: "Relatórios", icon: BarChart3, url: "/relatorios", roles: OBRA_ACCESS },
    ]
  },
  {
    group: "Comunicação",
    items: [
      { title: "Chat", icon: MessageSquare, url: "/chat", roles: CHAT_ACCESS, badge: "chat" as const },
    ]
  },
  {
    group: "Admin",
    items: [
      { title: "Cargos", icon: Briefcase, url: "/cargos", roles: FULL_ACCESS },
      { title: "Departamentos", icon: Network, url: "/departamentos", roles: FULL_ACCESS },
      { title: "Configurações", icon: Settings, url: "/configuracoes", roles: FULL_ACCESS },
    ]
  },
  {
    group: "Conta",
    items: [
      { title: "Meu Perfil", icon: User, url: "/minhas-informacoes", roles: ALL_ROLES },
    ]
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation();
  const { role, loading } = useUserRole();
  const { settings: branding } = useSystemSettings();
  const chatUnread = useChatGestorBadge();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const filteredGroups = menuGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        !loading && role && item.roles.includes(role)
      )
    }))
    .filter(group => group.items.length > 0);

  const renderItem = (item: (typeof menuGroups[0]['items'][0]) & { badge?: "chat" }) => {
    const active = isActive(item.url);
    const badgeCount = item.badge === "chat" ? chatUnread : 0;

    const linkEl = (
      <NavLink
        key={item.url}
        to={item.url}
        onClick={onNavigate}
        className={cn(
          "relative flex items-center rounded-lg text-sm font-medium transition-all duration-150 group",
          collapsed ? "h-9 w-9 justify-center mx-auto" : "px-3 py-2 gap-3",
          active
            ? "bg-sidebar-accent text-white"
            : "text-[hsl(var(--sidebar-foreground))] hover:bg-sidebar-accent hover:text-white"
        )}
      >
        {active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[hsl(var(--sidebar-primary))] rounded-r-full" />
        )}
        {/* Ícone com badge opcional */}
        <div className="relative flex-shrink-0">
          <item.icon className={cn(
            "h-4 w-4 transition-colors",
            active ? "text-[hsl(var(--sidebar-primary))]" : "text-[hsl(var(--sidebar-muted))] group-hover:text-[hsl(var(--sidebar-primary))]"
          )} />
          {badgeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-3.5 min-w-3.5 px-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </div>
        {!collapsed && (
          <span className="flex-1 truncate">{item.title}</span>
        )}
        {/* Badge no texto quando expandido */}
        {!collapsed && badgeCount > 0 && (
          <span className="ml-auto h-4 min-w-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none flex-shrink-0">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </NavLink>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.url} delayDuration={0}>
          <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {item.title}{badgeCount > 0 ? ` (${badgeCount})` : ""}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkEl;
  };

  return (
    <TooltipProvider>
      <div
        className={cn(
          "bg-[hsl(var(--sidebar-background))] flex flex-col h-full transition-all duration-200 ease-in-out",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center border-b border-[hsl(var(--sidebar-border))]",
          collapsed ? "h-14 justify-center px-2" : "h-14 px-4 gap-3"
        )}>
          {branding.logoUrl ? (
            /* Logo personalizada */
            collapsed ? (
              /* Collapsed: mostra só o ícone se disponível, senão thumbnail da logo */
              branding.iconUrl ? (
                <img
                  src={branding.iconUrl}
                  alt="ícone"
                  className="h-8 w-8 object-contain rounded-lg flex-shrink-0"
                />
              ) : (
                <img
                  src={branding.logoUrl}
                  alt="logo"
                  className="h-8 w-8 object-contain rounded-lg flex-shrink-0"
                />
              )
            ) : (
              <img
                src={branding.logoUrl}
                alt={branding.companyName}
                className="max-h-9 max-w-[160px] object-contain flex-shrink-0"
              />
            )
          ) : (
            /* Logo padrão */
            <>
              <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                {branding.iconUrl ? (
                  <img
                    src={branding.iconUrl}
                    alt="ícone"
                    className="h-5 w-5 object-contain"
                  />
                ) : (
                  <Gauge className="h-4 w-4 text-white" />
                )}
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white leading-tight truncate">
                    {branding.companyName}
                  </p>
                  <p className="text-xs text-[hsl(var(--sidebar-muted))] leading-tight">Gestão de Frotas</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {filteredGroups.map((group, i) => (
            <div key={group.group}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--sidebar-muted))]">
                  {group.group}
                </p>
              )}
              {collapsed && i > 0 && (
                <div className="my-2 border-t border-[hsl(var(--sidebar-border))]" />
              )}
              <div className={cn("space-y-0.5", collapsed && "flex flex-col items-center gap-0.5")}>
                {group.items.map(renderItem)}
              </div>
            </div>
          ))}
        </nav>

        {/* Toggle button at bottom */}
        <div className="p-2 border-t border-[hsl(var(--sidebar-border))]">
          <button
            onClick={onToggle}
            className={cn(
              "w-full flex items-center rounded-lg text-xs font-medium text-[hsl(var(--sidebar-muted))] hover:bg-sidebar-accent hover:text-white transition-all duration-150 py-2",
              collapsed ? "justify-center" : "px-3 gap-2"
            )}
          >
            <svg
              className={cn("h-4 w-4 flex-shrink-0 transition-transform duration-200", collapsed ? "rotate-0" : "rotate-180")}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {!collapsed && <span>Recolher</span>}
          </button>
        </div>
      </div>
    </TooltipProvider>
  );
}
