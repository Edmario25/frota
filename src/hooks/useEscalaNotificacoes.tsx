import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useAuth } from "@/contexts/AuthContext";

export type EscalaNotifTipo =
  | "folga_proxima"
  | "folga_atrasada"
  | "escala_remarcada"
  | "conflito_autorizado";

export interface EscalaNotificacao {
  id: string;
  employee_id: string;
  periodo_id: string | null;
  tipo: EscalaNotifTipo;
  titulo: string;
  mensagem: string;
  lida: boolean;
  created_at: string;
}

export interface CriarNotificacaoInput {
  employee_id: string;
  periodo_id?: string | null;
  tipo: EscalaNotifTipo;
  titulo: string;
  mensagem: string;
}

// ── VAPID public key gerada em 08/08/2026 ─────────────────────────────────
export const VAPID_PUBLIC_KEY =
  "BK9xrIJvkcVdWlrn4jY3KZSmAA2CgxG2V0gu-KaVflAHO6lhUPk5h_ObkC15Ga7r0QypnoT6w2NXXXqGqPa0CRM";

/** Converte base64url para Uint8Array (necessário para applicationServerKey) */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ── Hook principal ────────────────────────────────────────────────────────
export function useEscalaNotificacoes() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { employee } = useCurrentEmployee();

  const employeeId = employee?.id;

  // Busca notificações não-lidas deste funcionário
  const { data: notificacoes = [] } = useQuery({
    queryKey: ["escalaNotifs", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("escala_notificacoes" as any)
        .select("*")
        .eq("employee_id", employeeId!)
        .eq("lida", false)
        .order("created_at", { ascending: false });
      if (error) return [] as EscalaNotificacao[];
      return (data ?? []) as EscalaNotificacao[];
    },
  });

  // Realtime: re-fetch quando chegar nova notificação para este funcionário
  useEffect(() => {
    if (!employeeId) return;
    const channel = supabase
      .channel(`escala-notif-${employeeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "escala_notificacoes",
          filter: `employee_id=eq.${employeeId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["escalaNotifs", employeeId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [employeeId, qc]);

  // ── Ações para o gestor ──────────────────────────────────────────────────

  /** Insere uma notificação no DB para o funcionário indicado */
  const criarNotificacao = async (input: CriarNotificacaoInput) => {
    const { error } = await supabase
      .from("escala_notificacoes" as any)
      .insert({
        employee_id: input.employee_id,
        periodo_id: input.periodo_id ?? null,
        tipo: input.tipo,
        titulo: input.titulo,
        mensagem: input.mensagem,
        lida: false,
      });
    if (error) console.error("criarNotificacao:", error);
  };

  /** Chama a Edge Function que envia o push para todos os dispositivos do funcionário */
  const enviarPush = async (empId: string, titulo: string, mensagem: string) => {
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
        body: JSON.stringify({ employeeId: empId, titulo, mensagem }),
      });
    } catch (e) {
      console.warn("enviarPush:", e);
    }
  };

  // ── Ações para o app do motorista ────────────────────────────────────────

  const marcarComoLida = async (id: string) => {
    await supabase
      .from("escala_notificacoes" as any)
      .update({ lida: true })
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["escalaNotifs", employeeId] });
  };

  const marcarTodasComoLidas = async () => {
    if (!employeeId) return;
    await supabase
      .from("escala_notificacoes" as any)
      .update({ lida: true })
      .eq("employee_id", employeeId)
      .eq("lida", false);
    qc.invalidateQueries({ queryKey: ["escalaNotifs", employeeId] });
  };

  // ── Push subscription ────────────────────────────────────────────────────

  /** Registra o dispositivo para receber notificações push e salva no DB */
  const ativarPush = async (): Promise<"ok" | "negado" | "sem-sw" | "erro"> => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "sem-sw";
    if (!user?.id) return "erro";

    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return "negado";

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const raw = sub.toJSON();
      await supabase.from("push_subscriptions" as any).upsert(
        {
          user_id: user.id,
          endpoint: raw.endpoint!,
          p256dh: raw.keys!.p256dh,
          auth_key: raw.keys!.auth,
        },
        { onConflict: "endpoint" }
      );
      return "ok";
    } catch (e) {
      console.error("ativarPush:", e);
      return "erro";
    }
  };

  /** Remove a subscription deste dispositivo do DB e cancela no navegador */
  const desativarPush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const raw = sub.toJSON();
        await supabase
          .from("push_subscriptions" as any)
          .delete()
          .eq("endpoint", raw.endpoint!);
        await sub.unsubscribe();
      }
    } catch (e) {
      console.error("desativarPush:", e);
    }
  };

  /** Verifica se este dispositivo já tem push ativo */
  const verificarPushAtivo = async (): Promise<boolean> => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch { return false; }
  };

  return {
    notificacoes: notificacoes as EscalaNotificacao[],
    unreadCount: notificacoes.length,
    criarNotificacao,
    enviarPush,
    marcarComoLida,
    marcarTodasComoLidas,
    ativarPush,
    desativarPush,
    verificarPushAtivo,
  };
}
