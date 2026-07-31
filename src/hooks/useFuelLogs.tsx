import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type FuelLog = Database['public']['Tables']['vehicle_fuel_logs']['Row'];
type FuelLogInsert = Database['public']['Tables']['vehicle_fuel_logs']['Insert'];
type FuelLogUpdate = Database['public']['Tables']['vehicle_fuel_logs']['Update'];

const QK = ['fuelLogs'] as const;

export const useFuelLogs = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_fuel_logs' as any)
        .select('*')
        .order('data_abastecimento', { ascending: false });
      if (error) throw error;
      return (data as FuelLog[]) ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: async (d: FuelLogInsert) => {
      const dataToInsert = {
        ...d,
        valor_total: d.litros && d.valor_litro
          ? parseFloat((d.litros * d.valor_litro).toFixed(2))
          : null,
      };
      const { data, error } = await supabase.from('vehicle_fuel_logs' as any).insert([dataToInsert]).select().single();
      if (error) throw error;
      return data as FuelLog;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Abastecimento registrado", description: "O abastecimento foi registrado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao registrar abastecimento", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: FuelLogUpdate }) => {
      const dataToUpdate = {
        ...d,
        ...(d.litros && d.valor_litro ? { valor_total: parseFloat((d.litros * d.valor_litro).toFixed(2)) } : {}),
      };
      const { data, error } = await supabase.from('vehicle_fuel_logs' as any).update(dataToUpdate).eq('id', id).select().single();
      if (error) throw error;
      return data as FuelLog;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Abastecimento atualizado" });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vehicle_fuel_logs' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Abastecimento excluído" });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });

  return {
    fuelLogs: query.data ?? [],
    loading: query.isLoading,
    createFuelLog: (d: FuelLogInsert) => createMutation.mutateAsync(d),
    updateFuelLog: (id: string, d: FuelLogUpdate) => updateMutation.mutateAsync({ id, d }),
    deleteFuelLog: (id: string) => deleteMutation.mutateAsync(id),
    refetchFuelLogs: query.refetch,
  };
};
