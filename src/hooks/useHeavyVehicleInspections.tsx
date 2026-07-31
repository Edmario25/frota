import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type HeavyVehicleInspection = Database['public']['Tables']['heavy_vehicle_inspections']['Row'];
type HeavyVehicleInspectionInsert = Database['public']['Tables']['heavy_vehicle_inspections']['Insert'];
type HeavyVehicleInspectionItemInsert = Database['public']['Tables']['heavy_vehicle_inspection_items']['Insert'];

const QK = ['heavyVehicleInspections'] as const;

export const useHeavyVehicleInspections = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('heavy_vehicle_inspections')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: async (d: HeavyVehicleInspectionInsert) => {
      const { data, error } = await supabase.from('heavy_vehicle_inspections').insert([d]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Inspeção criada", description: "A inspeção foi criada com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao criar inspeção", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: Partial<HeavyVehicleInspectionInsert> }) => {
      const { data, error } = await supabase.from('heavy_vehicle_inspections').update(d).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Inspeção atualizada", description: "A inspeção foi atualizada com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar inspeção", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('heavy_vehicle_inspections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Inspeção excluída", description: "A inspeção foi excluída com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir inspeção", description: e.message, variant: "destructive" }),
  });

  const createInspectionItem = async (d: HeavyVehicleInspectionItemInsert) => {
    const { data, error } = await supabase.from('heavy_vehicle_inspection_items').insert([d]).select().single();
    if (error) {
      toast({ title: "Erro ao adicionar item", description: error.message, variant: "destructive" });
      throw error;
    }
    toast({ title: "Item adicionado", description: "Item da inspeção adicionado com sucesso." });
    return data;
  };

  const getInspectionItems = async (inspectionId: string) => {
    const { data, error } = await supabase
      .from('heavy_vehicle_inspection_items')
      .select('*')
      .eq('inspection_id', inspectionId)
      .order('categoria', { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar itens da inspeção", description: error.message, variant: "destructive" });
      return [];
    }
    return data ?? [];
  };

  return {
    inspections: query.data ?? [],
    loading: query.isLoading,
    createInspection: (d: HeavyVehicleInspectionInsert) => createMutation.mutateAsync(d),
    updateInspection: (id: string, d: Partial<HeavyVehicleInspectionInsert>) => updateMutation.mutateAsync({ id, d }),
    deleteInspection: (id: string) => deleteMutation.mutateAsync(id),
    createInspectionItem,
    getInspectionItems,
    refetchInspections: query.refetch,
  };
};
