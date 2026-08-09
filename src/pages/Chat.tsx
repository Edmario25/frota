import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { useChatGestor, ChatConversa } from "@/hooks/useChat";
import { MessageSquare, Send, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

function formatTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = parseISO(iso);
  if (isToday(d))     return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM", { locale: ptBR });
}

function getInitials(nome: string) {
  return nome.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Painel esquerdo: lista de conversas ────────────────────────────────────────
function ConversasList({
  conversas,
  selecionada,
  onSelecionar,
  loading,
}: {
  conversas: ChatConversa[];
  selecionada: ChatConversa | null;
  onSelecionar: (cv: ChatConversa) => void;
  loading: boolean;
}) {
  const [busca, setBusca] = useState("");

  const filtradas = conversas.filter(c =>
    c.motorista?.nome.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      {/* Header da lista */}
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold text-foreground mb-3">Conversas</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar motorista..."
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-4">
            <Users className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {busca ? "Nenhum motorista encontrado" : "Nenhuma conversa ainda"}
            </p>
            <p className="text-xs text-muted-foreground/60">
              As conversas aparecem quando um motorista enviar a primeira mensagem
            </p>
          </div>
        ) : (
          filtradas.map(cv => (
            <button
              key={cv.id}
              onClick={() => onSelecionar(cv)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 border-b border-border/50 text-left transition-colors",
                selecionada?.id === cv.id
                  ? "bg-primary/10 border-l-2 border-l-primary"
                  : "hover:bg-muted/50"
              )}
            >
              {/* Avatar */}
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-bold text-sm">
                  {getInitials(cv.motorista?.nome ?? "?")}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className="font-medium text-sm text-foreground truncate">
                    {cv.motorista?.nome ?? "Motorista"}
                  </p>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {formatTime(cv.ultima_mensagem_em)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <p className="text-xs text-muted-foreground truncate">
                    {cv.ultima_mensagem ?? "Sem mensagens"}
                  </p>
                  {cv.nao_lidas_gestor > 0 && (
                    <Badge
                      variant="destructive"
                      className="h-4 min-w-4 text-[10px] px-1 flex-shrink-0 rounded-full"
                    >
                      {cv.nao_lidas_gestor > 9 ? "9+" : cv.nao_lidas_gestor}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Painel direito: conversa aberta ───────────────────────────────────────────
function ConversaAberta({
  cv,
  mensagens,
  loadingMsgs,
  sending,
  onEnviar,
}: {
  cv: ChatConversa | null;
  mensagens: ReturnType<typeof useChatGestor>["mensagens"];
  loadingMsgs: boolean;
  sending: boolean;
  onEnviar: (t: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const bottomRef = useState<HTMLDivElement | null>(null);

  // Auto-scroll
  const setBottomRef = (el: HTMLDivElement | null) => {
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const handleSend = () => {
    const t = texto.trim();
    if (!t || sending) return;
    setTexto("");
    onEnviar(t);
  };

  if (!cv) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
        <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Selecione uma conversa</p>
          <p className="text-sm text-muted-foreground mt-1">
            Escolha um motorista na lista ao lado para ver e responder mensagens
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header da conversa */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-card flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center">
          <span className="text-primary font-bold text-sm">
            {getInitials(cv.motorista?.nome ?? "?")}
          </span>
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground">
            {cv.motorista?.nome ?? "Motorista"}
          </p>
          <p className="text-xs text-muted-foreground">Motorista</p>
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-muted/20">
        {loadingMsgs ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : mensagens.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma mensagem nos últimos 30 dias</p>
          </div>
        ) : (
          <>
            <p className="text-center text-xs text-muted-foreground py-1">
              Histórico dos últimos 30 dias
            </p>
            {mensagens.map((msg) => {
              const sou = msg.tipo_autor === "gestor";
              return (
                <div key={msg.id} className={cn("flex", sou ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[65%] rounded-2xl px-4 py-2.5 shadow-sm",
                      sou
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-card border border-border rounded-bl-sm"
                    )}
                  >
                    {!sou && (
                      <p className="text-[10px] font-semibold text-primary mb-0.5">
                        {cv.motorista?.nome}
                      </p>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {msg.mensagem}
                    </p>
                    <p className={cn(
                      "text-[10px] mt-1 text-right",
                      sou ? "text-primary-foreground/60" : "text-muted-foreground"
                    )}>
                      {formatTime(msg.criada_em)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={setBottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 bg-card border-t border-border px-4 py-3">
        <div className="flex items-end gap-2 max-w-4xl">
          <textarea
            value={texto}
            onChange={e => {
              setTexto(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Responder para ${cv.motorista?.nome ?? "motorista"}...`}
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-xl border border-input bg-background",
              "px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
              "max-h-[120px] overflow-y-auto"
            )}
            style={{ height: "auto" }}
          />
          <button
            onClick={handleSend}
            disabled={!texto.trim() || sending}
            className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all",
              texto.trim() && !sending
                ? "bg-primary hover:bg-primary/90"
                : "bg-muted"
            )}
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className={cn("h-4 w-4", texto.trim() ? "text-primary-foreground" : "text-muted-foreground")} />
            )}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Chat() {
  const {
    conversas, mensagens, selecionada, loading, loadingMsgs,
    sending, abrirConversa, enviarMensagem,
  } = useChatGestor();

  const totalNaoLidas = conversas.reduce((s, c) => s + (c.nao_lidas_gestor ?? 0), 0);

  return (
    <Layout>
      <div className="flex flex-col h-full">
        {/* Page header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
          <div className="relative">
            <MessageSquare className="h-5 w-5 text-foreground" />
            {totalNaoLidas > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                {totalNaoLidas > 9 ? "9+" : totalNaoLidas}
              </span>
            )}
          </div>
          <div>
            <h1 className="font-semibold text-foreground">Chat com Motoristas</h1>
            <p className="text-xs text-muted-foreground">
              {conversas.length} conversa{conversas.length !== 1 ? "s" : ""}
              {totalNaoLidas > 0 && ` · ${totalNaoLidas} não lida${totalNaoLidas !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Layout de duas colunas */}
        <div className="flex-1 overflow-hidden grid grid-cols-[300px_1fr]">
          <ConversasList
            conversas={conversas}
            selecionada={selecionada}
            onSelecionar={abrirConversa}
            loading={loading}
          />
          <ConversaAberta
            cv={selecionada}
            mensagens={mensagens}
            loadingMsgs={loadingMsgs}
            sending={sending}
            onEnviar={enviarMensagem}
          />
        </div>
      </div>
    </Layout>
  );
}
