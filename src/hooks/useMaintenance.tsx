import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserObra } from "@/hooks/useUserObra";
import { getVehicleIdsByObra } from "@/utils/obraFilters";
import type { Database } from "@/integrations/supabase/types";

type MaintenanceRecord = Database['public']['Tables']['maintenance_records']['Row'];
type MaintenanceRecordInsert = Database['public']['Tables']['maintenance_records']['Insert'];
type MaintenanceRecordUpdate = Database['public']['Tables']['maintenance_records']['Update'];

export const useMaintenance = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { shouldFilterByObra, loading: loadingRole } = useUserRole();
  const { obraId, loading: loadingObra } = useUserObra();

  const QK = ['maintenanceRecords', shouldFilterByObra, obraId] as const;

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      if (shouldFilterByObra && obraId) {
        const vehicleIds = await getVehicleIdsByObra(obraId);
        if (!vehicleIds.length) return [];
        const { data, error } = await supabase
          .from('maintenance_records').select('*')
          .in('vehicle_id', vehicleIds).order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
      }
      if (!shouldFilterByObra) {
        const { data, error } = await supabase
          .from('maintenance_records').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
      }
      return [];
    },
    enabled: !loadingRole && !loadingObra,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['maintenanceRecords'] });

  const createMutation = useMutation({
    mutationFn: async (d: MaintenanceRecordInsert) => {
      const { data, error } = await supabase.from('maintenance_records').insert([d]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Registro de manutenção criado", description: "O registro foi criado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao criar registro de manutenção", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: MaintenanceRecordUpdate }) => {
      const { data, error } = await supabase.from('maintenance_records').update(d).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Registro atualizado", description: "O registro foi atualizado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar registro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('maintenance_records').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Registro excluído", description: "O registro foi excluído com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir registro", description: e.message, variant: "destructive" }),
  });

  const getMaintenanceStats = () => {
    const records = query.data ?? [];
    return {
      agendada: records.filter(r => r.status === 'agendada').length,
      em_andamento: records.filter(r => r.status === 'em_andamento').length,
      concluida: records.filter(r => r.status === 'concluida').length,
      total: records.length,
    };
  };

  return {
    maintenanceRecords: query.data ?? [],
    loading: query.isLoading,
    createMaintenanceRecord: (d: MaintenanceRecordInsert) => createMutation.mutateAsync(d),
    updateMaintenanceRecord: (id: string, d: MaintenanceRecordUpdate) => updateMutation.mutateAsync({ id, d }),
    deleteMaintenanceRecord: (id: string) => deleteMutation.mutateAsync(id),
    refetchMaintenanceRecords: query.refetch,
    getMaintenanceStats,
  };
};
