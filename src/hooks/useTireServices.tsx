import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type TireService = Database['public']['Tables']['tire_services']['Row'];
type TireServiceInsert = Database['public']['Tables']['tire_services']['Insert'];
type TireServiceUpdate = Database['public']['Tables']['tire_services']['Update'];

const QK = ['tireServices'] as const;

export const useTireServices = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tire_services')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: async (d: TireServiceInsert) => {
      const { data, error } = await supabase.from('tire_services').insert([d]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Serviço de pneu registrado", description: "O serviço foi registrado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao registrar serviço", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: TireServiceUpdate }) => {
      const { data, error } = await supabase.from('tire_services').update(d).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Serviço atualizado", description: "O serviço foi atualizado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar serviço", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tire_services').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Serviço excluído", description: "O serviço foi excluído com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir serviço", description: e.message, variant: "destructive" }),
  });

  return {
    tireServices: query.data ?? [],
    loading: query.isLoading,
    createTireService: (d: TireServiceInsert) => createMutation.mutateAsync(d),
    updateTireService: (id: string, d: TireServiceUpdate) => updateMutation.mutateAsync({ id, d }),
    deleteTireService: (id: string) => deleteMutation.mutateAsync(id),
    refetchTireServices: query.refetch,
  };
};
