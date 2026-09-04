import { useI18n } from "@/i18n";
import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  User,
  Car,
  Calendar,
  BarChart3, CalendarDays,
  Settings,
  Truck,
  Building2,
  Boxes,
  Briefcase,
  Gauge,
  Network,
  Wallet,
  MessageSquare,
  ShieldCheck,
  AlertOctagon,
  ClipboardList,
  BookOpen,
  FileWarning,
  Package,
  GraduationCap,
  UserCheck,
  FileText,
  Timer,
  Wrench,
  CalendarRange,
  HardHat,
  PieChart,
  Globe,
  ShieldAlert,
  Megaphone,
  QrCode,
  Award,
  ChevronDown,
  Siren,
  Leaf,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions, type PermKey } from "@/hooks/usePermissions";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useChatGestorBadge } from "@/hooks/useChat";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Roles de acesso total (legado — mantido para compatibilidade)
const FULL_ACCESS = ['gestor_contrato', 'admin', 'gestor_frota'];
const OBRA_ACCESS = [...FULL_ACCESS, 'gestor_obra'];
const ALL_ROLES   = [...OBRA_ACCESS, 'funcionario'];
const CHAT_ACCESS = ['gestor_obra', 'admin'];
const SMS_ROLES   = [...OBRA_ACCESS, 'tecnico_sms'];

// Cada item de menu tem: roles (legado) + perm (nova permissão por cargo)
// O item aparece se: tem a role (legado) OU tem a permissão do cargo (novo)
const menuGroups = [
  {
    group: "Principal",
    items: [
      { title: "Dashboard", icon: LayoutDashboard, url: "/", roles: ALL_ROLES, perm: "acesso_dashboard" as PermKey },
    ]
  },
  {
    group: "Pessoas",
    items: [
      { title: "Funcionários",   icon: Users,    url: "/funcionarios", roles: OBRA_ACCESS, perm: "acesso_colaboradores" as PermKey },
      { title: "Escalas",        icon: Calendar, url: "/escalas",      roles: OBRA_ACCESS, perm: "acesso_escalas" as PermKey },
      { title: "Efetivo / Ponto",   icon: Timer,        url: "/efetivo",           roles: OBRA_ACCESS, perm: "acesso_efetivo" as PermKey },
      { title: "Espelho de Ponto",  icon: CalendarDays, url: "/efetivo/relatorio", roles: OBRA_ACCESS, perm: "acesso_efetivo" as PermKey },
      { title: "Ponto QR",          icon: QrCode,       url: "/ponto-qr",          roles: OBRA_ACCESS, perm: "acesso_efetivo" as PermKey },
    ]
  },
  {
    group: "Frota",
    items: [
      { title: "Veículos Leves",   icon: Car,   url: "/frota",            roles: OBRA_ACCESS, perm: "acesso_frota" as PermKey },
      { title: "Veículos Pesados", icon: Truck, url: "/veiculos-pesados", roles: OBRA_ACCESS, perm: "acesso_frota" as PermKey },
    ]
  },
  {
    group: "Projetos",
    items: [
      { title: "Obras",          icon: Building2, url: "/obras",          roles: OBRA_ACCESS, perm: "acesso_colaboradores" as PermKey },
      { title: "Fornecedores",   icon: Boxes,     url: "/fornecedores",   roles: OBRA_ACCESS, perm: "acesso_fornecedores" as PermKey },
      { title: "Almoxarifado",   icon: Package,   url: "/almoxarifado",   roles: OBRA_ACCESS, perm: "acesso_almoxarifado" as PermKey },
      { title: "Ferramentas",    icon: Wrench,    url: "/ferramentas",    roles: OBRA_ACCESS, perm: "acesso_ferramentas" as PermKey },
      { title: "Cronograma",      icon: CalendarRange, url: "/cronograma",      roles: OBRA_ACCESS, perm: "acesso_cronograma" as PermKey },
      { title: "Subcontratadas",  icon: HardHat,    url: "/subcontratadas",   roles: OBRA_ACCESS, perm: "acesso_subcontratadas" as PermKey },
      { title: "Orçado × Realizado", icon: PieChart, url: "/orcado-realizado", roles: OBRA_ACCESS, perm: "acesso_financeiro" as PermKey },
      { title: "Portal do Cliente",   icon: Globe,       url: "/portal-cliente",    roles: OBRA_ACCESS, perm: "acesso_relatorios" as PermKey },
      { title: "Visitantes",         icon: UserCheck,   url: "/visitantes",        roles: OBRA_ACCESS, perm: "acesso_visitantes"  as PermKey },
      { title: "Fundo Fixo",     icon: Wallet,    url: "/fundo-fixo",     roles: ALL_ROLES,   perm: "acesso_fundo_fixo" as PermKey },
    ]
  },
  {
    group: "Qualidade",
    items: [
      { title: "Painel da Qualidade", icon: Award,       url: "/qualidade",          roles: OBRA_ACCESS, perm: "acesso_qualidade" as PermKey },
      { title: "Não Conformidades",   icon: ShieldAlert, url: "/nao-conformidades", roles: OBRA_ACCESS, perm: "acesso_qualidade" as PermKey },
    ]
  },
  {
    group: "Análises",
    items: [
      { title: "Relatórios",   icon: BarChart3, url: "/relatorios",        roles: OBRA_ACCESS, perm: "acesso_relatorios" as PermKey },
      { title: "Rel. Escalas", icon: Calendar,  url: "/relatorios-escala", roles: OBRA_ACCESS, perm: "acesso_relatorios" as PermKey },
      { title: "Custo de Pessoal", icon: Wallet, url: "/relatorio-folha", roles: FULL_ACCESS, perm: null },
    ]
  },
  {
    group: "Comunicação",
    items: [
      { title: "Chat",         icon: MessageSquare, url: "/chat",         roles: CHAT_ACCESS, perm: null,                                  badge: "chat" as const },
      { title: "Comunicados",  icon: Megaphone,     url: "/comunicados",  roles: ALL_ROLES,   perm: "acesso_comunicados" as PermKey },
    ]
  },
  {
    group: "SMS / SSMA",
    items: [
      { title: "Painel SMS",        icon: ShieldCheck,   url: "/sms",              roles: SMS_ROLES, perm: "acesso_sms_dashboard" as PermKey },
      { title: "Desvios",           icon: AlertOctagon,  url: "/sms/desvios",      roles: SMS_ROLES, perm: "acesso_sms_desvios" as PermKey },
      { title: "Ocorrências / PT",  icon: Siren,         url: "/sms/ocorrencias",  roles: SMS_ROLES, perm: "acesso_sms_desvios" as PermKey },
      { title: "Gestão Legal",      icon: Leaf,          url: "/sms/gestao-legal", roles: SMS_ROLES, perm: "acesso_sms_dashboard" as PermKey },
      { title: "Inspeções",         icon: ClipboardList, url: "/sms/inspecoes",    roles: SMS_ROLES, perm: "acesso_sms_inspecoes" as PermKey },
      { title: "DDS",               icon: BookOpen,      url: "/sms/dds",          roles: SMS_ROLES, perm: "acesso_sms_dds" as PermKey },
      { title: "APR",               icon: FileWarning,   url: "/sms/apr",          roles: SMS_ROLES, perm: "acesso_sms_apr" as PermKey },
      { title: "EPIs",              icon: Package,       url: "/sms/epis",         roles: SMS_ROLES, perm: "acesso_sms_epis" as PermKey },
      { title: "Treinamentos",      icon: GraduationCap, url: "/sms/treinamentos", roles: SMS_ROLES, perm: "acesso_sms_treinamentos" as PermKey },
      { title: "Matriz de Treinamentos", icon: BarChart3, url: "/sms/conformidade", roles: SMS_ROLES, perm: "acesso_sms_treinamentos" as PermKey },
      { title: "Integração na Obra", icon: UserCheck,    url: "/sms/admissao",     roles: SMS_ROLES, perm: "acesso_sms_admissao" as PermKey },
      { title: "RDO",               icon: FileText,      url: "/sms/rdo",          roles: SMS_ROLES, perm: "acesso_sms_rdo" as PermKey },
    ]
  },
  {
    group: "Admin",
    items: [
      { title: "Cargos",         icon: Briefcase, url: "/cargos",         roles: FULL_ACCESS, perm: null },
      { title: "Departamentos",  icon: Network,   url: "/departamentos",  roles: FULL_ACCESS, perm: null },
      { title: "Configurações",  icon: Settings,  url: "/configuracoes",  roles: FULL_ACCESS, perm: null },
      { title: "Auditoria do Sistema", icon: History, url: "/auditoria", roles: ['admin'], perm: null },
    ]
  },
  {
    group: "Conta",
    items: [
      { title: "Meu Perfil", icon: User, url: "/minhas-informacoes", roles: ALL_ROLES, perm: null },
    ]
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const { t } = useI18n();
  const location = useLocation();
  const { role, loading: loadingRole } = useUserRole();
  const { can, loading: loadingPerms, ready: permsReady } = usePermissions();
  const { settings: branding } = useSystemSettings();
  const chatUnread = useChatGestorBadge();
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("sidebar-open-groups");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const loading = loadingRole || loadingPerms;

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  // Item visível se: role legada permite (comportamento anterior)
  //              OU  cargo tem a permissão específica (novo PBAC)
  const itemVisible = (item: { roles: string[]; perm: PermKey | null }) => {
    if (loading) return false;
    // perm = null → controlado apenas por role (Admin, Conta, Chat)
    if (item.perm === null) return !!role && item.roles.includes(role);
    // Tenta permissão do cargo primeiro (novo sistema)
    if (permsReady && can(item.perm)) return true;
    // Fallback para role legada (cargos ainda não migrados)
    return !!role && item.roles.includes(role);
  };

  const filteredGroups = menuGroups
    .map(group => ({
      ...group,
      items: group.items.filter(itemVisible),
    }))
    .filter(group => group.items.length > 0);

  // A seção da página atual permanece aberta, inclusive após navegação direta.
  useEffect(() => {
    const activeGroup = menuGroups.find(group =>
      group.items.some(item => isActive(item.url)),
    )?.group;
    if (!activeGroup) return;
    setOpenGroups(current =>
      current.includes(activeGroup) ? current : [...current, activeGroup],
    );
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem("sidebar-open-groups", JSON.stringify(openGroups));
  }, [openGroups]);

  const toggleGroup = (groupName: string) => {
    setOpenGroups(current =>
      current.includes(groupName)
        ? current.filter(name => name !== groupName)
        : [...current, groupName],
    );
  };

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
          <span className="flex-1 truncate">{t(item.title)}</span>
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
            {t(item.title)}{badgeCount > 0 ? ` (${badgeCount})` : ""}
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
          "bg-[hsl(var(--sidebar-background))] flex flex-col h-screen overflow-hidden transition-all duration-200 ease-in-out",
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
                  <p className="text-xs text-[hsl(var(--sidebar-muted))] leading-tight">{t("Plataforma de Gestão")}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 min-h-0 overflow-y-auto py-3 px-2 space-y-4 [scrollbar-width:thin] [scrollbar-color:hsl(var(--sidebar-border))_transparent]">
          {filteredGroups.map((group, i) => {
            const groupOpen = collapsed || openGroups.includes(group.group);
            const groupHasActiveItem = group.items.some(item => isActive(item.url));
            return (
            <div key={group.group}>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.group)}
                  aria-expanded={groupOpen}
                  className={cn(
                    "mb-1 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors",
                    groupHasActiveItem
                      ? "text-[hsl(var(--sidebar-primary))]"
                      : "text-[hsl(var(--sidebar-muted))] hover:bg-sidebar-accent/50 hover:text-white",
                  )}
                >
                  <span>{t(group.group)}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", !groupOpen && "-rotate-90")} />
                </button>
              )}
              {collapsed && i > 0 && (
                <div className="my-2 border-t border-[hsl(var(--sidebar-border))]" />
              )}
              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
                  groupOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className={cn("space-y-0.5", collapsed && "flex flex-col items-center gap-0.5")}>
                    {group.items.map(renderItem)}
                  </div>
                </div>
              </div>
            </div>
          )})}
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
            {!collapsed && <span>{t("Recolher")}</span>}
          </button>
        </div>
      </div>
    </TooltipProvider>
  );
}
