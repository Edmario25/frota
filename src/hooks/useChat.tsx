import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ChatConversa {
  id: string;
  motorista_id: string;
  criada_em: string;
  ultima_mensagem_em: string | null;
  ultima_mensagem: string | null;
  nao_lidas_motorista: number;
  nao_lidas_gestor: number;
  motorista?: { id: string; nome: string };
}

export interface ChatMensagem {
  id: string;
  conversa_id: string;
  autor_id: string;
  tipo_autor: "motorista" | "gestor";
  mensagem: string;
  lida: boolean;
  criada_em: string;
}

// ── Utilitário: envia push via edge function (reutilizado pelo chat) ──────────
export async function enviarPushChat(employeeId: string, titulo: string, mensagem: string) {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return;
    const supabaseUrl = (supabase as any).supabaseUrl as string;
    await fetch(`${supabaseUrl}/functions/v1/send-escala-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: (supabase as any).supabaseKey as string,
      },
      body: JSON.stringify({ employeeId, titulo, mensagem }),
    });
  } catch (e) {
    console.warn("enviarPushChat:", e);
  }
}

// ── Limite de histórico: 30 dias ──────────────────────────────────────────────
function getLimite30Dias() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

// ── Hook para o MOTORISTA ──────────────────────────────────────────────────────
export function useChatMotorista(motoristaId: string | undefined) {
  const [conversa, setConversa]   = useState<ChatConversa | null>(null);
  const [mensagens, setMensagens] = useState<ChatMensagem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(false);
  const { toast }                 = useToast();
  const channelRef                = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadConversa = useCallback(async () => {
    if (!motoristaId) return;
    setLoading(true);
    try {
      const { data: existing } = await (supabase as any)
        .from("chat_conversas")
        .select("*")
        .eq("motorista_id", motoristaId)
        .maybeSingle();

      if (existing) {
        setConversa(existing);
        const { data } = await (supabase as any)
          .from("chat_mensagens")
          .select("*")
          .eq("conversa_id", existing.id)
          .gte("criada_em", getLimite30Dias())
          .order("criada_em", { ascending: true });
        setMensagens((data as ChatMensagem[]) ?? []);
        // Zera não lidas ao abrir
        await (supabase as any)
          .from("chat_conversas")
          .update({ nao_lidas_motorista: 0 })
          .eq("id", existing.id);
      } else {
        const { data: nova, error } = await (supabase as any)
          .from("chat_conversas")
          .insert({ motorista_id: motoristaId })
          .select()
          .single();
        if (error) throw error;
        setConversa(nova);
        setMensagens([]);
      }
    } catch (err: any) {
      toast({ title: "Erro ao carregar chat", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [motoristaId]);

  // Realtime: escuta TODAS as mensagens desta conversa
  useEffect(() => {
    if (!conversa?.id) return;

    channelRef.current?.unsubscribe();

    channelRef.current = supabase
      .channel(`chat-motorista-${conversa.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_mensagens",
          filter: `conversa_id=eq.${conversa.id}`,
        },
        (payload) => {
          const nova = payload.new as ChatMensagem;

          setMensagens(prev => {
            if (prev.some(m => m.id === nova.id)) return prev;
            return [...prev, nova];
          });

          // Notifica visualmente quando a mensagem vem do gestor
          if (nova.tipo_autor === "gestor") {
            toast({
              title: "💬 Mensagem do Gestor",
              description: nova.mensagem.length > 60
                ? nova.mensagem.slice(0, 60) + "…"
                : nova.mensagem,
              duration: 5000,
            });
            // Zera contador imediatamente pois o chat está aberto
            (supabase as any)
              .from("chat_conversas")
              .update({ nao_lidas_motorista: 0 })
              .eq("id", conversa.id);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_conversas",
          filter: `id=eq.${conversa.id}`,
        },
        (payload) => setConversa(payload.new as ChatConversa)
      )
      .subscribe((status) => {
        if (status === "SUBSCRIPTION_ERROR") {
          console.warn("Realtime chat motorista: erro na subscription");
        }
      });

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [conversa?.id]);

  const enviarMensagem = useCallback(async (texto: string) => {
    if (!conversa?.id || !texto.trim()) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("chat_mensagens")
        .insert({
          conversa_id: conversa.id,
          autor_id:    user?.id,
          tipo_autor:  "motorista",
          mensagem:    texto.trim(),
        });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "Erro ao enviar mensagem", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [conversa?.id]);

  useEffect(() => { loadConversa(); }, [loadConversa]);

  return { conversa, mensagens, loading, sending, enviarMensagem };
}

// ── Hook para o GESTOR ─────────────────────────────────────────────────────────
export function useChatGestor() {
  const [conversas, setConversas]     = useState<ChatConversa[]>([]);
  const [mensagens, setMensagens]     = useState<ChatMensagem[]>([]);
  const [selecionada, setSelecionada] = useState<ChatConversa | null>(null);
  const [loading, setLoading]         = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending]         = useState(false);
  const { toast }                     = useToast();

  // Refs para os canais Realtime
  const chConversas = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chMensagens = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Mantém ref atualizada com as conversas (para evitar closure stale)
  const conversasRef = useRef<ChatConversa[]>([]);
  conversasRef.current = conversas;

  // Mantém ref atualizada com a conversa selecionada
  const selecionadaRef = useRef<ChatConversa | null>(null);
  selecionadaRef.current = selecionada;

  const loadConversas = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("chat_conversas")
        .select("*, motorista:employees!motorista_id(id, nome)")
        .order("ultima_mensagem_em", { ascending: false, nullsFirst: false });
      if (error) throw error;
      setConversas((data as ChatConversa[]) ?? []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar conversas", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  const abrirConversa = useCallback(async (cv: ChatConversa) => {
    setSelecionada(cv);
    setLoadingMsgs(true);

    const { data, error } = await (supabase as any)
      .from("chat_mensagens")
      .select("*")
      .eq("conversa_id", cv.id)
      .gte("criada_em", getLimite30Dias())
      .order("criada_em", { ascending: true });

    if (!error) setMensagens((data as ChatMensagem[]) ?? []);
    setLoadingMsgs(false);

    // Zera não lidas desta conversa para o gestor
    await (supabase as any)
      .from("chat_conversas")
      .update({ nao_lidas_gestor: 0 })
      .eq("id", cv.id);

    setConversas(prev => prev.map(c => c.id === cv.id ? { ...c, nao_lidas_gestor: 0 } : c));

    // ── Realtime: mensagens da conversa selecionada ──
    chMensagens.current?.unsubscribe();
    chMensagens.current = supabase
      .channel(`chat-gestor-msgs-${cv.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_mensagens",
          filter: `conversa_id=eq.${cv.id}`,
        },
        (payload) => {
          const nova = payload.new as ChatMensagem;
          setMensagens(prev => {
            if (prev.some(m => m.id === nova.id)) return prev;
            return [...prev, nova];
          });
          // Se motorista mandou enquanto tínhamos a conversa aberta, zera contador
          if (nova.tipo_autor === "motorista") {
            (supabase as any)
              .from("chat_conversas")
              .update({ nao_lidas_gestor: 0 })
              .eq("id", cv.id);
          }
        }
      )
      .subscribe();
  }, []);

  // ── Realtime GLOBAL: escuta TODAS as msgs do motorista (para notificação) ──
  useEffect(() => {
    loadConversas();

    // Canal 1: mudanças nas conversas (UPDATEs de ultima_mensagem, badges, INSERTs de novas)
    // O trigger do banco atualiza nao_lidas_gestor e ultima_mensagem em chat_conversas →
    // usamos isso para notificar o gestor em vez de ouvir chat_mensagens sem filtro.
    chConversas.current = supabase
      .channel("chat-gestor-conversas")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_conversas" },
        () => loadConversas()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_conversas" },
        (payload) => {
          const updated = payload.new as ChatConversa;

          // Notifica se nao_lidas_gestor aumentou para uma conversa não selecionada
          const prev = conversasRef.current.find(c => c.id === updated.id);
          if (
            (updated.nao_lidas_gestor ?? 0) > (prev?.nao_lidas_gestor ?? 0) &&
            selecionadaRef.current?.id !== updated.id
          ) {
            const nome = prev?.motorista?.nome ?? "Motorista";
            toast({
              title: `💬 ${nome}`,
              description: updated.ultima_mensagem
                ? (updated.ultima_mensagem.length > 60
                    ? updated.ultima_mensagem.slice(0, 60) + "…"
                    : updated.ultima_mensagem)
                : "Nova mensagem",
              duration: 6000,
            });
          }

          // Atualiza estado da lista
          setConversas(prev =>
            prev
              .map(c => c.id === updated.id
                ? { ...c, ...updated, motorista: c.motorista }
                : c
              )
              .sort((a, b) => {
                const ta = a.ultima_mensagem_em ?? a.criada_em;
                const tb = b.ultima_mensagem_em ?? b.criada_em;
                return tb.localeCompare(ta);
              })
          );
          setSelecionada(prev =>
            prev?.id === updated.id ? { ...prev, ...updated } : prev
          );
        }
      )
      .subscribe();

    return () => {
      chConversas.current?.unsubscribe();
      chMensagens.current?.unsubscribe();
    };
  }, [loadConversas]);

  const enviarMensagem = useCallback(async (texto: string) => {
    if (!selecionada?.id || !texto.trim()) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("chat_mensagens")
        .insert({
          conversa_id: selecionada.id,
          autor_id:    user?.id,
          tipo_autor:  "gestor",
          mensagem:    texto.trim(),
        });
      if (error) throw error;

      // ── Envia push para o motorista ─────────────────────────────────────
      // Usa o employee_id do motorista para notificar via VAPID
      if (selecionada.motorista_id) {
        enviarPushChat(
          selecionada.motorista_id,
          "💬 Mensagem do Gestor",
          texto.trim().length > 100 ? texto.trim().slice(0, 100) + "…" : texto.trim()
        );
      }
    } catch (err: any) {
      toast({ title: "Erro ao enviar mensagem", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [selecionada]);

  const totalNaoLidas = conversas.reduce((s, c) => s + (c.nao_lidas_gestor ?? 0), 0);

  return {
    conversas,
    mensagens,
    selecionada,
    loading,
    loadingMsgs,
    sending,
    totalNaoLidas,
    abrirConversa,
    enviarMensagem,
  };
}

// ── Hook leve para o badge no Sidebar ─────────────────────────────────────────
export function useChatGestorBadge() {
  const [total, setTotal] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchTotal = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("chat_conversas")
      .select("nao_lidas_gestor");
    if (data) {
      setTotal((data as any[]).reduce((s, c) => s + (c.nao_lidas_gestor ?? 0), 0));
    }
  }, []);

  useEffect(() => {
    fetchTotal();

    channelRef.current = supabase
      .channel("chat-badge-gestor")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_conversas" },
        () => fetchTotal())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_conversas" },
        () => fetchTotal())
      .subscribe();

    return () => { channelRef.current?.unsubscribe(); };
  }, [fetchTotal]);

  return total;
}

// ── Hook leve para o badge da aba Chat no app do motorista ────────────────────
export function useChatMotoristaBadge(motoristaId: string | undefined) {
  const [total, setTotal] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchTotal = useCallback(async () => {
    if (!motoristaId) return;
    const { data } = await (supabase as any)
      .from("chat_conversas")
      .select("nao_lidas_motorista")
      .eq("motorista_id", motoristaId)
      .maybeSingle();
    if (data) setTotal(data.nao_lidas_motorista ?? 0);
  }, [motoristaId]);

  useEffect(() => {
    if (!motoristaId) return;
    fetchTotal();

    channelRef.current = supabase
      .channel(`chat-badge-motorista-${motoristaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_conversas",
          filter: `motorista_id=eq.${motoristaId}`,
        },
        () => fetchTotal()
      )
      .subscribe();

    return () => { channelRef.current?.unsubscribe(); };
  }, [motoristaId, fetchTotal]);

  return total;
}
