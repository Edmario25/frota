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
  responsavel_tecnico_id?: string;
  numero_contrato?: string;
  objeto_contrato?: string;
  valor_contrato?: number;
  centro_custo?: string;
  tipo_obra?: string;
  data_inicio_real?: string;
  data_termino_real?: string;
  gerente_obra_id?: string;
  responsavel_sms_id?: string;
  responsavel_qualidade_id?: string;
  contato_cliente_nome?: string;
  contato_cliente_email?: string;
  contato_cliente_telefone?: string;
  motivo_status?: string;
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
          .from('obras' as any).select('*').eq('id', obraId).is('arquivada_em', null).order('created_at', { ascending: false });
        if (error) throw error;
        return (data as any as Obra[]) ?? [];
      }
      if (!shouldFilterByObra && !isFuncionario) {
        const { data, error } = await supabase
          .from('obras' as any).select('*').is('arquivada_em', null).order('created_at', { ascending: false });
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
      const { status, motivo_status, ...cadastro } = d;
      const { data, error } = await supabase.from('obras' as any).update(cadastro).eq('id', id).select().single();
      if (error) throw error;
      if (status && status !== (data as any).status) {
        const { error: statusError } = await (supabase as any).rpc('alterar_status_obra', {
          p_obra_id: id, p_status: status, p_motivo: motivo_status || null,
        });
        if (statusError) throw statusError;
      }
      return data as any as Obra;
    },
    onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Obra atualizada com sucesso" }); },
    onError: (error: any) => toast({ title: "Não foi possível atualizar", description: error.message || "Verifique os dados e as pendências da obra.", variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await (supabase as any).rpc('arquivar_obra', { p_obra_id: id, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: "Obra arquivada", description: "O histórico completo foi preservado." }); },
    onError: (error: any) => toast({ title: "Não foi possível arquivar", description: error.message, variant: "destructive" }),
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
    deleteObra: (id: string, motivo = "Arquivamento administrativo") => archiveMutation.mutateAsync({ id, motivo }),
    refetchObras: query.refetch,
    getObraStats,
  };
};
