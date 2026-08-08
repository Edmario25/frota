import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Home, PlusCircle, ClipboardList, Wind, CalendarDays, User, WifiOff, RefreshCw, Smartphone } from "lucide-react";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useUserRole } from "@/hooks/useUserRole";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";
import { AppHome } from "./AppHome";
import { AppLancar } from "./AppLancar";
import { AppChecklist } from "./AppChecklist";
import { AppFumaca } from "./AppFumaca";
import { AppEscala } from "./AppEscala";
import { AppPerfil } from "./AppPerfil";

type Tab = "home" | "lancar" | "checklist" | "fumaca" | "escala" | "perfil";

const tabs = [
  { id: "home",      label: "Início",    Icon: Home },
  { id: "lancar",    label: "Lançar",    Icon: PlusCircle },
  { id: "checklist", label: "Checklist", Icon: ClipboardList },
  { id: "fumaca",    label: "Fumaça",    Icon: Wind },
  { id: "escala",    label: "Escala",    Icon: CalendarDays },
  { id: "perfil",    label: "Perfil",    Icon: User },
] as const;

export default function MobileApp() {
  const [active, setActive] = useState<Tab>("home");
  const navigate = useNavigate();

  const { isFuncionario, loading: loadingRole } = useUserRole();
  const { employee, loading: loadingEmployee }   = useCurrentEmployee();
  const { isOnline, queueCount, syncQueue }      = useOnlineStatus();

  const loading = loadingRole || loadingEmployee;

  /**
   * Regra de acesso ao /app:
   *  - Funcionário (tipo_acesso = 'funcionario'): sempre tem acesso
   *  - Qualquer outro cargo: só tem acesso se acesso_app_motorista = true no cadastro
   *  - Se não tem acesso → volta ao dashboard
   */
  const temAcesso = isFuncionario || (employee?.acesso_app_motorista === true);

  useEffect(() => {
    if (loading) return;
    if (!temAcesso) {
      navigate("/", { replace: true });
    }
  }, [loading, temAcesso, navigate]);

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-slate-900">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!temAcesso) return null;

  const renderTab = () => {
    switch (active) {
      case "home":      return <AppHome onNavigate={setActive} />;
      case "lancar":    return <AppLancar />;
      case "checklist": return <AppChecklist />;
      case "fumaca":    return <AppFumaca />;
      case "escala":    return <AppEscala />;
      case "perfil":    return <AppPerfil />;
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">

      {/* Barra offline */}
      {!isOnline && (
        <div className="flex-shrink-0 bg-amber-500 text-white px-4 py-2 flex items-center gap-2 text-sm font-medium">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">
            Sem conexão — lançamentos serão salvos e enviados quando voltar
            {queueCount > 0 && ` (${queueCount} na fila)`}
          </span>
        </div>
      )}

      {/* Barra de pendentes quando voltar online */}
      {isOnline && queueCount > 0 && (
        <button
          onClick={syncQueue}
          className="flex-shrink-0 bg-blue-600 text-white px-4 py-2 flex items-center gap-2 text-sm font-medium active:bg-blue-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4 flex-shrink-0 animate-spin" />
          <span className="flex-1">
            {queueCount} lançamento{queueCount > 1 ? "s" : ""} aguardando sincronização — toque para enviar
          </span>
        </button>
      )}

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {renderTab()}
      </div>

      {/* Nav inferior */}
      <nav className="flex-shrink-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 safe-area-bottom">
        <div className="flex items-stretch h-16">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id as Tab)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors",
                active === id
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-slate-400 dark:text-slate-500"
              )}
            >
              <Icon className={cn("h-5 w-5", active === id && "scale-110 transition-transform")} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
