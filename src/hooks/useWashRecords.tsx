import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type WashRecord = Database['public']['Tables']['wash_records']['Row'];
type WashRecordInsert = Database['public']['Tables']['wash_records']['Insert'];
type WashRecordUpdate = Database['public']['Tables']['wash_records']['Update'];

const QK = ['washRecords'] as const;

export const useWashRecords = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wash_records')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: async (d: WashRecordInsert) => {
      const { data, error } = await supabase.from('wash_records').insert([d]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Registro de lavagem criado", description: "O registro foi criado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao criar registro de lavagem", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: WashRecordUpdate }) => {
      const { data, error } = await supabase.from('wash_records').update(d).eq('id', id).select().single();
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
      const { error } = await supabase.from('wash_records').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Registro excluído", description: "O registro foi excluído com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir registro", description: e.message, variant: "destructive" }),
  });

  return {
    washRecords: query.data ?? [],
    loading: query.isLoading,
    createWashRecord: (d: WashRecordInsert) => createMutation.mutateAsync(d),
    updateWashRecord: (id: string, d: WashRecordUpdate) => updateMutation.mutateAsync({ id, d }),
    deleteWashRecord: (id: string) => deleteMutation.mutateAsync(id),
    refetchWashRecords: query.refetch,
  };
};
