import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Home, PlusCircle, ClipboardList, Wind, CalendarDays, User, WifiOff, RefreshCw, MessageSquare } from "lucide-react";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useUserRole } from "@/hooks/useUserRole";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { AppHome } from "./AppHome";
import { AppLancar } from "./AppLancar";
import { AppChecklist } from "./AppChecklist";
import { AppFumaca } from "./AppFumaca";
import { AppEscala } from "./AppEscala";
import { AppPerfil } from "./AppPerfil";
import { AppChat } from "./AppChat";
import { AppLogin } from "./AppLogin";
import { useEscalaNotificacoes } from "@/hooks/useEscalaNotificacoes";
import { useChatMotoristaBadge } from "@/hooks/useChat";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { playNotifSound } from "@/lib/notifSound";

type Tab = "home" | "lancar" | "checklist" | "fumaca" | "escala" | "chat" | "perfil";
type LancarType = "abastecimento" | "manutencao" | "borracharia" | "lavagem" | "multa" | "avaria" | null;

const tabs = [
  { id: "home",      label: "Início",    Icon: Home },
  { id: "lancar",    label: "Lançar",    Icon: PlusCircle },
  { id: "checklist", label: "Checklist", Icon: ClipboardList },
  { id: "escala",    label: "Escala",    Icon: CalendarDays },
  { id: "chat",      label: "Chat",      Icon: MessageSquare },
  { id: "perfil",    label: "Perfil",    Icon: User },
] as const;

export default function MobileApp() {
  const [active, setActive]         = useState<Tab>("home");
  const [lancarType, setLancarType] = useState<LancarType>(null);
  const [viewportH, setViewportH]   = useState("100dvh");
  const navigate                    = useNavigate();

  // ── Ajuste de altura pelo teclado virtual (iOS Safari) ──────────────────────
  // No iOS o teclado NÃO redimensiona o viewport; usamos visualViewport para isso.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewportH(`${vv.height}px`);
    vv.addEventListener("resize", update);
    update();
    return () => vv.removeEventListener("resize", update);
  }, []);

  const handleNavigate = (tab: Tab, subType?: string) => {
    if (tab === "lancar" && subType) {
      setLancarType(subType as LancarType);
    } else {
      setLancarType(null);
    }
    activeRef.current = tab;
    setActive(tab);
  };

  const { user, loading: loadingAuth }          = useAuth();
  const { isFuncionario, loading: loadingRole } = useUserRole();
  const { employee, loading: loadingEmployee }  = useCurrentEmployee();
  const { isOnline, queueCount, syncQueue }     = useOnlineStatus();
  const { unreadCount: escalaUnread }           = useEscalaNotificacoes();
  const chatUnread                              = useChatMotoristaBadge(employee?.id);
  const { toast }                               = useToast();
  const activeRef                               = useRef<Tab>("home");

  const loading = loadingAuth || loadingRole || loadingEmployee;

  const metaAccess = user?.user_metadata?.acesso_app_motorista === true;
  const temAcesso  = isFuncionario || metaAccess || (employee?.acesso_app_motorista === true);

  // ── Notificação global: toast quando gestor envia msg e motorista não está na aba chat ──
  // Observa chat_conversas (com filtro por motorista_id) em vez de chat_mensagens sem filtro.
  // O trigger do banco já atualiza nao_lidas_motorista e ultima_mensagem, então é mais confiável.
  useEffect(() => {
    if (!employee?.id) return;

    let prevNaoLidas = 0;

    // Lê o valor inicial de nao_lidas para comparar depois
    (supabase as any)
      .from("chat_conversas")
      .select("nao_lidas_motorista")
      .eq("motorista_id", employee.id)
      .maybeSingle()
      .then(({ data }: { data: { nao_lidas_motorista: number } | null }) => {
        if (data) prevNaoLidas = data.nao_lidas_motorista ?? 0;
      });

    const channel = supabase
      .channel(`app-notif-conv-${employee.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_conversas",
          filter: `motorista_id=eq.${employee.id}`,
        },
        (payload) => {
          const updated = payload.new as { nao_lidas_motorista: number; ultima_mensagem: string | null };
          const novasNaoLidas = updated.nao_lidas_motorista ?? 0;

          // Só notifica se nao_lidas aumentou E não está na aba chat
          if (novasNaoLidas > prevNaoLidas && activeRef.current !== "chat") {
            playNotifSound();
            toast({
              title: "💬 Mensagem do Gestor",
              description: updated.ultima_mensagem
                ? (updated.ultima_mensagem.length > 60
                    ? updated.ultima_mensagem.slice(0, 60) + "…"
                    : updated.ultima_mensagem)
                : "Nova mensagem",
              duration: 6000,
            });
          }
          prevNaoLidas = novasNaoLidas;
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [employee?.id]);

  useEffect(() => {
    if (!loadingAuth && !loadingRole && !loadingEmployee && user && !temAcesso) {
      navigate("/", { replace: true });
    }
  }, [loadingAuth, loadingRole, loadingEmployee, user, temAcesso, navigate]);

  if (!loadingAuth && !user) {
    return <AppLogin onSuccess={() => {}} />;
  }

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
      case "home":      return <AppHome onNavigate={handleNavigate} />;
      case "lancar":    return <AppLancar initialType={lancarType} />;
      case "checklist": return <AppChecklist />;
      case "fumaca":    return <AppFumaca />;
      case "escala":    return <AppEscala />;
      case "chat":      return <AppChat />;
      case "perfil":    return <AppPerfil />;
    }
  };

  return (
    <div style={{ height: viewportH }} className="flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">

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
              onClick={() => handleNavigate(id as Tab)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative",
                active === id
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-slate-400 dark:text-slate-500"
              )}
            >
              <div className="relative">
                <Icon className={cn("h-5 w-5", active === id && "scale-110 transition-transform")} />

                {/* Badge Escala */}
                {id === "escala" && escalaUnread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {escalaUnread > 9 ? "9+" : escalaUnread}
                  </span>
                )}

                {/* Badge Chat */}
                {id === "chat" && chatUnread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {chatUnread > 9 ? "9+" : chatUnread}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
