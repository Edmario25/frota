import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Departamento = Database['public']['Tables']['departamentos']['Row'];
type DepartamentoInsert = Database['public']['Tables']['departamentos']['Insert'];
type DepartamentoUpdate = Database['public']['Tables']['departamentos']['Update'];

const QK = ['departamentos'] as const;

export const useDepartamentos = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departamentos')
        .select('*')
        .order('nome', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: async (d: DepartamentoInsert) => {
      const { data, error } = await supabase.from('departamentos').insert([d]).select().single();
      if (error) throw error;
      return data as Departamento;
    },
    onSuccess: (novo) => {
      qc.setQueryData(QK, (old: Departamento[] = []) =>
        [...old, novo].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      );
      invalidate();
      toast({ title: "Departamento cadastrado", description: "O departamento foi cadastrado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao cadastrar departamento", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: DepartamentoUpdate }) => {
      const { data, error } = await supabase.from('departamentos').update(d).eq('id', id).select().single();
      if (error) throw error;
      return data as Departamento;
    },
    onSuccess: (atualizado) => {
      qc.setQueryData(QK, (old: Departamento[] = []) => old.map(dep => dep.id === atualizado.id ? atualizado : dep));
      invalidate();
      toast({ title: "Departamento atualizado", description: "O departamento foi atualizado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar departamento", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('departamentos').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (_, id) => {
      qc.setQueryData(QK, (old: Departamento[] = []) => old.filter(dep => dep.id !== id));
      invalidate();
      toast({ title: "Departamento excluído", description: "O departamento foi excluído com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir departamento", description: e.message, variant: "destructive" }),
  });

  return {
    departamentos: query.data ?? [],
    loading: query.isLoading,
    createDepartamento: (d: DepartamentoInsert) => createMutation.mutateAsync(d),
    updateDepartamento: (id: string, d: DepartamentoUpdate) => updateMutation.mutateAsync({ id, d }),
    deleteDepartamento: (id: string) => deleteMutation.mutateAsync(id),
    refetchDepartamentos: query.refetch,
  };
};
