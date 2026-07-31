import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserObra } from "@/hooks/useUserObra";

type Obra = {
  id: string;
  nome: string;
  codigo_interno?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  coordenadas_gps?: string;
  cliente_nome: string;
  cliente_cnpj?: string;
  data_inicio_prevista?: string;
  data_termino_prevista?: string;
  status: string;
  responsavel_tecnico?: string;
  observacoes?: string;
  created_at: string;
  updated_at: string;
};

type ObraInsert = Omit<Obra, 'id' | 'created_at' | 'updated_at'>;
type ObraUpdate = Partial<ObraInsert>;

export const useObras = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { shouldFilterByObra, isFuncionario, loading: loadingRole } = useUserRole();
  const { obraId, loading: loadingObra } = useUserObra();

  const QK = ['obras', shouldFilterByObra, isFuncionario, obraId] as const;

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      if ((shouldFilterByObra || isFuncionario) && obraId) {
        const { data, error } = await supabase
          .from('obras' as any).select('*').eq('id', obraId).order('created_at', { ascending: false });
        if (error) throw error;
        return (data as any as Obra[]) ?? [];
      }
      if (!shouldFilterByObra && !isFuncionario) {
        const { data, error } = await supabase
          .from('obras' as any).select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data as any as Obra[]) ?? [];
      }
      return [];
    },
    enabled: !loadingRole && !loadingObra,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['obras'] });

  const createMutation = useMutation({
    mutationFn: async (d: ObraInsert) => {
      const { data, error } = await supabase.from('obras' as any).insert(d).select().single();
      if (error) throw error;
      return data as any as Obra;
    },
    onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Obra criada com sucesso" }); },
    onError: () => toast({ title: "Erro", description: "Erro ao criar obra", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: ObraUpdate }) => {
      const { data, error } = await supabase.from('obras' as any).update(d).eq('id', id).select().single();
      if (error) throw error;
      return data as any as Obra;
    },
    onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Obra atualizada com sucesso" }); },
    onError: () => toast({ title: "Erro", description: "Erro ao atualizar obra", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('obras' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Obra excluída com sucesso" }); },
    onError: () => toast({ title: "Erro", description: "Erro ao excluir obra", variant: "destructive" }),
  });

  const getObraStats = () => {
    const obras = query.data ?? [];
    const stats = obras.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {} as Record<string, number>);
    return {
      total: obras.length,
      planejadas: stats.planejada || 0,
      em_andamento: stats.em_andamento || 0,
      pausadas: stats.pausada || 0,
      concluidas: stats.concluida || 0,
    };
  };

  return {
    obras: query.data ?? [],
    loading: query.isLoading,
    createObra: (d: ObraInsert) => createMutation.mutateAsync(d),
    updateObra: (id: string, d: ObraUpdate) => updateMutation.mutateAsync({ id, d }),
    deleteObra: (id: string) => deleteMutation.mutateAsync(id),
    refetchObras: query.refetch,
    getObraStats,
  };
};
