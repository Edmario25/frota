import { useState, useEffect, useRef } from "react";
import { Send, MessageSquare, ChevronLeft } from "lucide-react";
import { useChatMotorista } from "@/hooks/useChat";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatTime(iso: string) {
  const d = parseISO(iso);
  if (isToday(d))     return format(d, "HH:mm");
  if (isYesterday(d)) return `Ontem ${format(d, "HH:mm")}`;
  return format(d, "dd/MM HH:mm", { locale: ptBR });
}

export function AppChat() {
  const { employee } = useCurrentEmployee();
  const { user }     = useAuth();
  const {
    mensagens, loading, sending, enviarMensagem,
  } = useChatMotorista(employee?.id);

  const [texto, setTexto]         = useState("");
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll ao fundo quando chegam mensagens novas
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const handleSend = async () => {
    const t = texto.trim();
    if (!t || sending) return;
    setTexto("");
    await enviarMensagem(t);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Ajusta altura do textarea dinamicamente
  const handleTextoChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTexto(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="flex-shrink-0 bg-gradient-to-r from-blue-700 to-blue-600 px-4 pt-10 pb-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-base leading-tight">Chat com Gestão</p>
          <p className="text-blue-200 text-xs">Envie mensagens para seu gestor</p>
        </div>
      </div>

      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {mensagens.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
            <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <MessageSquare className="h-8 w-8 text-blue-400" />
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
              Nenhuma mensagem ainda
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-xs">
              Envie uma mensagem para seu gestor. Ele receberá e poderá responder aqui.
            </p>
          </div>
        ) : (
          <>
            <p className="text-center text-[10px] text-slate-400 py-1">
              Histórico dos últimos 30 dias
            </p>
            {mensagens.map((msg) => {
              const sou = msg.tipo_autor === "motorista";
              return (
                <div
                  key={msg.id}
                  className={cn("flex", sou ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm",
                      sou
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-sm border border-slate-100 dark:border-slate-700"
                    )}
                  >
                    {!sou && (
                      <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-0.5">
                        Gestor
                      </p>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {msg.mensagem}
                    </p>
                    <p className={cn(
                      "text-[10px] mt-1 text-right",
                      sou ? "text-blue-200" : "text-slate-400"
                    )}>
                      {formatTime(msg.criada_em)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-3 py-3 safe-area-bottom">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={texto}
            onChange={handleTextoChange}
            onKeyDown={handleKeyDown}
            placeholder="Escreva sua mensagem..."
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-2xl border border-slate-200 dark:border-slate-600",
              "bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100",
              "px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
              "max-h-[120px] overflow-y-auto leading-relaxed"
            )}
            style={{ height: "auto" }}
          />
          <button
            onClick={handleSend}
            disabled={!texto.trim() || sending}
            className={cn(
              "h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all",
              texto.trim() && !sending
                ? "bg-blue-600 hover:bg-blue-700 active:scale-95"
                : "bg-slate-200 dark:bg-slate-600",
            )}
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className={cn("h-4 w-4", texto.trim() ? "text-white" : "text-slate-400")} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
