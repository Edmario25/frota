import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Cargo = Database['public']['Tables']['cargos']['Row'];
type CargoInsert = Database['public']['Tables']['cargos']['Insert'];
type CargoUpdate = Database['public']['Tables']['cargos']['Update'];

const QK = ['cargos'] as const;

export const useCargos = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cargos')
        .select('*')
        .order('nivel_hierarquico', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: async (d: CargoInsert) => {
      const { data, error } = await supabase.from('cargos').insert([d]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Cargo cadastrado", description: "O cargo foi cadastrado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao cadastrar cargo", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: CargoUpdate }) => {
      const { data, error } = await supabase.from('cargos').update(d).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Cargo atualizado", description: "O cargo foi atualizado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar cargo", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cargos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Cargo excluído", description: "O cargo foi excluído com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir cargo", description: e.message, variant: "destructive" }),
  });

  return {
    cargos: query.data ?? [],
    loading: query.isLoading,
    createCargo: (d: CargoInsert) => createMutation.mutateAsync(d),
    updateCargo: (id: string, d: CargoUpdate) => updateMutation.mutateAsync({ id, d }),
    deleteCargo: (id: string) => deleteMutation.mutateAsync(id),
    refetchCargos: query.refetch,
  };
};
