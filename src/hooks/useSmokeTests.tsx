import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type SmokeTest = Database['public']['Tables']['smoke_tests']['Row'];
type SmokeTestInsert = Database['public']['Tables']['smoke_tests']['Insert'];
type SmokeTestUpdate = Database['public']['Tables']['smoke_tests']['Update'];

const QK = ['smokeTests'] as const;

const applyRingelmann = <T extends SmokeTestInsert | SmokeTestUpdate>(d: T): T => {
  const out = { ...d };
  if (out.indice_ringelmann && !out.densidade_percentual)
    out.densidade_percentual = out.indice_ringelmann * 20;
  if (out.indice_ringelmann && out.dentro_limite === undefined)
    out.dentro_limite = out.indice_ringelmann <= 3;
  if (out.dentro_limite !== undefined && !out.resultado)
    out.resultado = out.dentro_limite ? "aprovado" : "reprovado";
  return out;
};

export const useSmokeTests = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('smoke_tests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: async (d: SmokeTestInsert) => {
      const { data, error } = await supabase.from('smoke_tests').insert([applyRingelmann(d)]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Teste de fumaça registrado", description: "O teste foi registrado com sucesso na Escala Ringelmann." });
    },
    onError: (e: any) => toast({ title: "Erro ao registrar teste", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: SmokeTestUpdate }) => {
      const { data, error } = await supabase.from('smoke_tests').update(applyRingelmann(d)).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Teste atualizado", description: "O teste foi atualizado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar teste", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('smoke_tests').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Teste excluído", description: "O teste foi excluído com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir teste", description: e.message, variant: "destructive" }),
  });

  return {
    smokeTests: query.data ?? [],
    loading: query.isLoading,
    createSmokeTest: (d: SmokeTestInsert) => createMutation.mutateAsync(d),
    updateSmokeTest: (id: string, d: SmokeTestUpdate) => updateMutation.mutateAsync({ id, d }),
    deleteSmokeTest: (id: string) => deleteMutation.mutateAsync(id),
    refetchSmokeTests: query.refetch,
  };
};
