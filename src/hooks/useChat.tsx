import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { playNotifSound } from "@/lib/notifSound";

export interface ChatConversa {
  id: string;
  motorista_id: string;
  obra_id?: string | null;
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

// ── Utilitário: envia push via edge function ──────────────────────────────────
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
        // Zera não lidas ao abrir o chat
        await (supabase as any)
          .from("chat_conversas")
          .update({ nao_lidas_motorista: 0 })
          .eq("id", existing.id);
      } else {
        // Cria a conversa (obra_id preenchido pelo trigger do banco)
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

  // ── Realtime: mensagens desta conversa ────────────────────────────────────
  // FIX: captura o channel por valor no closure do cleanup para evitar
  //      cancelar o canal errado quando conversa.id muda rapidamente.
  useEffect(() => {
    if (!conversa?.id) return;

    const channel = supabase
      .channel(`chat-motorista-${conversa.id}`)
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

          // FIX: sem toast quando chat está aberto — a mensagem já aparece na tela.
          // O MobileApp cuida da notificação quando o chat NÃO está ativo.
          // Apenas zera o contador de não lidas:
          if (nova.tipo_autor === "gestor") {
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

    // FIX: fecha o canal capturado por valor, não via ref
    return () => { supabase.removeChannel(channel); };
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

  const chConversas = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chMensagens = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Refs para evitar stale closure nos callbacks Realtime
  const conversasRef   = useRef<ChatConversa[]>([]);
  conversasRef.current = conversas;

  const selecionadaRef   = useRef<ChatConversa | null>(null);
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

  // ── Gestor inicia conversa com motorista sem histórico ────────────────────
  const criarOuAbrirConversa = useCallback(async (motoristaId: string) => {
    // Se já existe, apenas abre
    const existente = conversasRef.current.find(c => c.motorista_id === motoristaId);
    if (existente) {
      abrirConversa(existente);
      return;
    }
    try {
      const { data, error } = await (supabase as any)
        .from("chat_conversas")
        .insert({ motorista_id: motoristaId })
        .select("*, motorista:employees!motorista_id(id, nome)")
        .single();
      if (error) throw error;
      const nova = data as ChatConversa;
      setConversas(prev => [nova, ...prev]);
      abrirConversa(nova);
    } catch (err: any) {
      toast({ title: "Erro ao iniciar conversa", description: err.message, variant: "destructive" });
    }
  }, [abrirConversa]);

  // ── Lista motoristas da obra sem conversa (para o gestor iniciar) ─────────
  const buscarMotoristasDisp = useCallback(async (): Promise<{ id: string; nome: string }[]> => {
    const { data, error } = await (supabase as any)
      .from("obra_funcionarios")
      .select("employee_id, employee:employees!employee_id(id, nome)")
      .eq("status", true);

    if (error || !data) return [];

    const comConversa = new Set(conversasRef.current.map(c => c.motorista_id));
    const seen = new Set<string>();
    const result: { id: string; nome: string }[] = [];

    for (const row of data as any[]) {
      if (row.employee && !comConversa.has(row.employee_id) && !seen.has(row.employee_id)) {
        seen.add(row.employee_id);
        result.push(row.employee);
      }
    }

    return result.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, []);

  // ── Realtime: lista de conversas + notificações ───────────────────────────
  useEffect(() => {
    loadConversas();

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
          const prev = conversasRef.current.find(c => c.id === updated.id);

          // Notifica se nao_lidas_gestor aumentou em conversa não selecionada
          if (
            (updated.nao_lidas_gestor ?? 0) > (prev?.nao_lidas_gestor ?? 0) &&
            selecionadaRef.current?.id !== updated.id
          ) {
            playNotifSound();
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

          // Atualiza estado da lista mantendo o JOIN do motorista
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

  // FIX: totalNaoLidas calculado apenas uma vez (no hook) — Chat.tsx usa este
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
    criarOuAbrirConversa,
    buscarMotoristasDisp,
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
