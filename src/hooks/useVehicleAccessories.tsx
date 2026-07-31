import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type VehicleAccessory = Database['public']['Tables']['vehicle_accessories']['Row'];
type VehicleAccessoryInsert = Database['public']['Tables']['vehicle_accessories']['Insert'];
type VehicleAccessoryUpdate = Database['public']['Tables']['vehicle_accessories']['Update'];

const QK = ['vehicleAccessories'] as const;

export const useVehicleAccessories = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_accessories')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: async (d: VehicleAccessoryInsert) => {
      const { data, error } = await supabase.from('vehicle_accessories').insert([d]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Acessório registrado", description: "O acessório foi registrado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao registrar acessório", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: VehicleAccessoryUpdate }) => {
      const { data, error } = await supabase.from('vehicle_accessories').update(d).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Acessório atualizado", description: "O acessório foi atualizado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar acessório", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vehicle_accessories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Acessório excluído", description: "O acessório foi excluído com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir acessório", description: e.message, variant: "destructive" }),
  });

  return {
    accessories: query.data ?? [],
    loading: query.isLoading,
    createAccessory: (d: VehicleAccessoryInsert) => createMutation.mutateAsync(d),
    updateAccessory: (id: string, d: VehicleAccessoryUpdate) => updateMutation.mutateAsync({ id, d }),
    deleteAccessory: (id: string) => deleteMutation.mutateAsync(id),
    refetchAccessories: query.refetch,
  };
};
