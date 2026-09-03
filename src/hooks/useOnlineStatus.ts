import { useEffect, useState, useCallback } from "react";
import { getQueue, dequeue, QueuedOperation } from "@/lib/offlineQueue";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

/** Retorna se o navegador está online e expõe contagem de ops na fila. */
export function useOnlineStatus() {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);

  const refreshCount = useCallback(() => setQueueCount(user?.id ? getQueue(user.id).length : 0), [user?.id]);

  /** Tenta sincronizar todas as ops na fila com o Supabase */
  const syncQueue = useCallback(async () => {
    if (!user?.id) return;
    const queue = getQueue(user.id);
    if (queue.length === 0) return;

    toast.loading(`Sincronizando ${queue.length} operação${queue.length > 1 ? "ões" : ""}…`, {
      id: "sync-toast",
    });

    let successCount = 0;
    let failCount = 0;

    for (const op of queue) {
      try {
        await flushOperation(op);
        dequeue(op.id);
        successCount++;
      } catch (err) {
        console.error("[offlineQueue] falha ao sincronizar op:", op, err);
        failCount++;
      }
    }

    refreshCount();

    if (failCount === 0) {
      toast.success(`${successCount} operação${successCount > 1 ? "ões sincronizadas" : " sincronizada"}!`, { id: "sync-toast" });
    } else {
      toast.warning(`${successCount} ok, ${failCount} com erro. Tente novamente.`, { id: "sync-toast" });
    }
  }, [refreshCount, user?.id]);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      syncQueue();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [syncQueue]);

  return { isOnline, queueCount, refreshCount, syncQueue };
}

/** Executa uma operação salva na fila contra o Supabase */
async function flushOperation(op: QueuedOperation) {
  switch (op.action) {
    case "insert": {
      const { error } = await supabase
        .from(op.table as never)
        .upsert(op.payload as never, { onConflict: "id", ignoreDuplicates: false });
      if (error) throw error;
      break;
    }
    case "update": {
      const { id, ...rest } = op.payload as { id: string } & Record<string, unknown>;
      const { error } = await supabase
        .from(op.table as never)
        .update(rest as never)
        .eq("id", id);
      if (error) throw error;
      break;
    }
    case "delete": {
      const { id } = op.payload as { id: string };
      const { error } = await supabase
        .from(op.table as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
      break;
    }
  }
}
