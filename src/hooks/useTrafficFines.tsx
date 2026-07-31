import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type TrafficFine = Database['public']['Tables']['traffic_fines']['Row'];
type TrafficFineInsert = Database['public']['Tables']['traffic_fines']['Insert'];
type TrafficFineUpdate = Database['public']['Tables']['traffic_fines']['Update'];

const QK = ['trafficFines'] as const;

export const useTrafficFines = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('traffic_fines')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: async (d: TrafficFineInsert) => {
      const { data, error } = await supabase.from('traffic_fines').insert([d]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Multa registrada", description: "A multa foi registrada com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao registrar multa", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: TrafficFineUpdate }) => {
      const { data, error } = await supabase.from('traffic_fines').update(d).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Multa atualizada", description: "A multa foi atualizada com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar multa", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('traffic_fines').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Multa excluída", description: "A multa foi excluída com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir multa", description: e.message, variant: "destructive" }),
  });

  const getTrafficFineStats = () => {
    const fines = query.data ?? [];
    const total = fines.length;
    const pagas = fines.filter(f => f.situacao === 'paga').length;
    const pendentes = fines.filter(f => f.situacao === 'pendente').length;
    const valorTotal = fines.reduce((acc, f) => acc + Number(f.valor), 0);
    const valorPendente = fines.filter(f => f.situacao === 'pendente').reduce((acc, f) => acc + Number(f.valor), 0);
    return { total, pagas, pendentes, valorTotal, valorPendente };
  };

  return {
    trafficFines: query.data ?? [],
    loading: query.isLoading,
    createTrafficFine: (d: TrafficFineInsert) => createMutation.mutateAsync(d),
    updateTrafficFine: (id: string, d: TrafficFineUpdate) => updateMutation.mutateAsync({ id, d }),
    deleteTrafficFine: (id: string) => deleteMutation.mutateAsync(id),
    refetchTrafficFines: query.refetch,
    getTrafficFineStats,
  };
};
