import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type DamageReport = Database['public']['Tables']['damage_reports']['Row'];
type DamageReportInsert = Database['public']['Tables']['damage_reports']['Insert'];
type DamageReportUpdate = Database['public']['Tables']['damage_reports']['Update'];

const QK = ['damageReports'] as const;

export const useDamageReports = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('damage_reports')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: async (d: DamageReportInsert) => {
      const { data, error } = await supabase.from('damage_reports').insert([d]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Relatório de avaria criado", description: "O relatório foi criado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao criar relatório de avaria", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: DamageReportUpdate }) => {
      const { data, error } = await supabase.from('damage_reports').update(d).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Relatório atualizado", description: "O relatório foi atualizado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar relatório", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('damage_reports').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Relatório excluído", description: "O relatório foi excluído com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir relatório", description: e.message, variant: "destructive" }),
  });

  return {
    damageReports: query.data ?? [],
    loading: query.isLoading,
    createDamageReport: (d: DamageReportInsert) => createMutation.mutateAsync(d),
    updateDamageReport: (id: string, d: DamageReportUpdate) => updateMutation.mutateAsync({ id, d }),
    deleteDamageReport: (id: string) => deleteMutation.mutateAsync(id),
    refetchDamageReports: query.refetch,
  };
};
