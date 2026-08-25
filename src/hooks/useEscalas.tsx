import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface EscalaTipo {
  id: string;
  nome: string;
  dias_trabalho: number;
  dias_folga: number;
  permite_sobreposicao: boolean;
  descricao: string | null;
  created_at: string;
  updated_at: string;
}

export interface EscalaPeriodo {
  id: string;
  employee_id: string;
  escala_tipo_id: string;
  data_inicio_trabalho: string;
  data_fim_trabalho: string;
  data_inicio_folga: string;
  data_fim_folga: string;
  status: string;
  conflito_detectado: boolean;
  conflito_autorizado: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  employee?: { id: string; nome: string; cargo_id: string | null };
  escala_tipo?: EscalaTipo;
}

export type EscalaTipoInsert = Omit<EscalaTipo, 'id' | 'created_at' | 'updated_at'>;
export type EscalaTipoUpdate = Partial<EscalaTipoInsert>;
export type EscalaPeriodoInsert = Omit<EscalaPeriodo, 'id' | 'created_at' | 'updated_at' | 'employee' | 'escala_tipo'>;
export type EscalaPeriodoUpdate = Partial<EscalaPeriodoInsert>;

const QK_TIPOS = ['escalaTipos'] as const;
const QK_PERIODOS = ['escalaPeriodos'] as const;

export const useEscalas = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const tiposQuery = useQuery({
    queryKey: QK_TIPOS,
    queryFn: async () => {
      const { data, error } = await supabase.from("escala_tipos").select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as EscalaTipo[];
    },
  });

  const periodosQuery = useQuery({
    queryKey: QK_PERIODOS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("escala_periodos")
        .select(`*, employee:employees(id, nome, cargo_id), escala_tipo:escala_tipos(*)`)
        .order("data_inicio_trabalho", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EscalaPeriodo[];
    },
  });

  const loading = tiposQuery.isLoading || periodosQuery.isLoading;
  const invalidateTipos = () => qc.invalidateQueries({ queryKey: QK_TIPOS });
  const invalidatePeriodos = () => qc.invalidateQueries({ queryKey: QK_PERIODOS });
  const invalidateAll = () => { invalidateTipos(); invalidatePeriodos(); };

  // ── EscalaTipo mutations ──────────────────────────────────────────────────
  const createTipoMutation = useMutation({
    mutationFn: async (d: EscalaTipoInsert) => {
      const { data, error } = await supabase.from("escala_tipos").insert(d).select().single();
      if (error) throw error;
      return data as EscalaTipo;
    },
    onSuccess: () => { invalidateTipos(); toast({ title: "Sucesso", description: "Tipo de escala criado com sucesso." }); },
    onError: () => toast({ title: "Erro", description: "Não foi possível criar o tipo de escala.", variant: "destructive" }),
  });

  const updateTipoMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: EscalaTipoUpdate }) => {
      const { data, error } = await supabase.from("escala_tipos").update(d).eq("id", id).select().single();
      if (error) throw error;
      return data as EscalaTipo;
    },
    onSuccess: () => { invalidateTipos(); toast({ title: "Sucesso", description: "Tipo de escala atualizado com sucesso." }); },
    onError: () => toast({ title: "Erro", description: "Não foi possível atualizar o tipo de escala.", variant: "destructive" }),
  });

  const deleteTipoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("escala_tipos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateTipos(); toast({ title: "Sucesso", description: "Tipo de escala excluído com sucesso." }); },
    onError: () => toast({ title: "Erro", description: "Não foi possível excluir o tipo de escala.", variant: "destructive" }),
  });

  // ── EscalaPeriodo mutations ───────────────────────────────────────────────
  const createPeriodoMutation = useMutation({
    mutationFn: async (d: EscalaPeriodoInsert) => {
      const { data, error } = await supabase
        .from("escala_periodos")
        .insert(d)
        .select(`*, employee:employees(id, nome, cargo_id), escala_tipo:escala_tipos(*)`)
        .single();
      if (error) throw error;
      return data as EscalaPeriodo;
    },
    onSuccess: () => { invalidatePeriodos(); toast({ title: "Sucesso", description: "Período de escala criado com sucesso." }); },
    onError: () => toast({ title: "Erro", description: "Não foi possível criar o período de escala.", variant: "destructive" }),
  });

  const updatePeriodoMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: EscalaPeriodoUpdate }) => {
      const { data, error } = await supabase
        .from("escala_periodos")
        .update(d)
        .eq("id", id)
        .select(`*, employee:employees(id, nome, cargo_id), escala_tipo:escala_tipos(*)`)
        .single();
      if (error) throw error;
      return data as EscalaPeriodo;
    },
    onSuccess: () => { invalidatePeriodos(); toast({ title: "Sucesso", description: "Período de escala atualizado com sucesso." }); },
    onError: () => toast({ title: "Erro", description: "Não foi possível atualizar o período de escala.", variant: "destructive" }),
  });

  const deletePeriodoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("escala_periodos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidatePeriodos(); toast({ title: "Sucesso", description: "Período de escala excluído com sucesso." }); },
    onError: () => toast({ title: "Erro", description: "Não foi possível excluir o período de escala.", variant: "destructive" }),
  });

  const checkConflicts = async (
    employeeId: string,
    cargoId: string | null,
    dataInicioFolga: string,
    dataFimFolga: string,
    excludePeriodoId?: string
  ): Promise<EscalaPeriodo[]> => {
    if (!cargoId) return [];
    try {
      // A cobertura operacional é por obra: pessoas do mesmo cargo em obras
      // diferentes não representam conflito entre si.
      const { data: employeeObras, error: obrasError } = await supabase
        .from("obra_funcionarios")
        .select("obra_id")
        .eq("employee_id", employeeId)
        .eq("status", true);
      if (obrasError) throw obrasError;

      const { data: sameCargoEmployees, error: empError } = await supabase
        .from("employees").select("id, nome").eq("cargo_id", cargoId).eq("status", "ativo").neq("id", employeeId);
      if (empError) throw empError;

      let candidateIds = (sameCargoEmployees ?? []).map(e => e.id);
      const obraIds = (employeeObras ?? []).map(o => o.obra_id);
      if (obraIds.length && candidateIds.length) {
        const { data: sameObraLinks, error: linksError } = await supabase
          .from("obra_funcionarios")
          .select("employee_id")
          .in("obra_id", obraIds)
          .in("employee_id", candidateIds)
          .eq("status", true);
        if (linksError) throw linksError;
        candidateIds = [...new Set((sameObraLinks ?? []).map(link => link.employee_id))];
      } else {
        candidateIds = [];
      }

      // Também impede dois períodos sobrepostos para o próprio funcionário.
      candidateIds.push(employeeId);

      let query = supabase
        .from("escala_periodos")
        .select(`*, employee:employees(id, nome, cargo_id), escala_tipo:escala_tipos(*)`)
        .in("employee_id", candidateIds)
        .neq("status", "concluido")
        .or(`and(data_inicio_folga.lte.${dataFimFolga},data_fim_folga.gte.${dataInicioFolga})`);

      if (excludePeriodoId) query = query.neq("id", excludePeriodoId);
      const { data: conflicts, error } = await query;
      if (error) throw error;
      return (conflicts ?? []) as EscalaPeriodo[];
    } catch (error) {
      console.error("Erro ao validar conflitos de escala:", error);
      throw error;
    }
  };

  return {
    escalaTipos: tiposQuery.data ?? [],
    escalaPeriodos: periodosQuery.data ?? [],
    loading,
    createEscalaTipo: (d: EscalaTipoInsert) => createTipoMutation.mutateAsync(d),
    updateEscalaTipo: (id: string, d: EscalaTipoUpdate) => updateTipoMutation.mutateAsync({ id, d }),
    deleteEscalaTipo: (id: string) => deleteTipoMutation.mutateAsync(id),
    createEscalaPeriodo: (d: EscalaPeriodoInsert) => createPeriodoMutation.mutateAsync(d),
    updateEscalaPeriodo: (id: string, d: EscalaPeriodoUpdate) => updatePeriodoMutation.mutateAsync({ id, d }),
    deleteEscalaPeriodo: (id: string) => deletePeriodoMutation.mutateAsync(id),
    checkConflicts,
    refetch: invalidateAll,
  };
};
