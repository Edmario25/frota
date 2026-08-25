import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, User, LogOut, Settings, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

const routeLabels: Record<string, string> = {
  "/": "Dashboard",
  "/funcionarios": "Funcionários",
  "/escalas": "Escalas",
  "/frota": "Veículos Leves",
  "/veiculos-pesados": "Veículos Pesados",
  "/manutencao": "Manutenção",
  "/obras": "Obras",
  "/fornecedores": "Fornecedores",
  "/relatorios": "Relatórios",
  "/cargos": "Cargos",
  "/configuracoes": "Configurações",
  "/minhas-informacoes": "Minhas Informações",
  "/chat": "Chat com Motoristas",
};

interface HeaderProps {
  onMenuClick: () => void;
  alertCount?: number;
  onBellClick?: () => void;
  onSidebarToggle?: () => void;
  sidebarCollapsed?: boolean;
}

export function Header({ onMenuClick, alertCount = 0, onBellClick, onSidebarToggle, sidebarCollapsed }: HeaderProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const getInitials = (email: string) => email.slice(0, 2).toUpperCase();

  const pageTitle = routeLabels[location.pathname] ?? "Ápice Gestão";

  return (
    <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 flex-shrink-0">
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden h-8 w-8 flex-shrink-0"
        onClick={onMenuClick}
      >
        <Menu className="h-4 w-4" />
      </Button>

      <Button variant="ghost" size="icon" className="hidden md:flex h-8 w-8 flex-shrink-0" onClick={onSidebarToggle} title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}>
        {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4"/> : <PanelLeftClose className="h-4 w-4"/>}
      </Button>

      {/* Page title */}
      <h2 className="text-sm font-semibold text-foreground flex-1 truncate">
        {pageTitle}
      </h2>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={onBellClick}
            title={alertCount > 0 ? `${alertCount} alerta${alertCount > 1 ? "s" : ""} de escala` : "Alertas"}
          >
            <Bell className={alertCount > 0 ? "h-4 w-4 text-amber-500" : "h-4 w-4 text-muted-foreground"} />
          </Button>
          {alertCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 text-[10px] px-1 flex items-center justify-center rounded-full pointer-events-none"
            >
              {alertCount > 9 ? "9+" : alertCount}
            </Badge>
          )}
        </div>

        {/* User menu */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 rounded-lg p-0">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user.user_metadata?.avatar_url} alt="Avatar" />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                    {getInitials(user.email || "US")}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52 rounded-xl p-1.5" align="end" forceMount>
              <DropdownMenuLabel className="font-normal px-2 py-1.5">
                <p className="text-sm font-semibold leading-none truncate">
                  {user.user_metadata?.full_name || "Usuário"}
                </p>
                <p className="text-xs leading-none text-muted-foreground mt-0.5 truncate">
                  {user.email}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => navigate("/minhas-informacoes")}
                className="rounded-lg cursor-pointer text-sm"
              >
                <User className="mr-2 h-3.5 w-3.5" />
                Perfil
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate("/configuracoes")}
                className="rounded-lg cursor-pointer text-sm"
              >
                <Settings className="mr-2 h-3.5 w-3.5" />
                Configurações
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="rounded-lg cursor-pointer text-sm text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
