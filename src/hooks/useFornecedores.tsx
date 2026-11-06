import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserObra } from "@/hooks/useUserObra";
import { usePermissions } from "@/hooks/usePermissions";
import { getFornecedorIdsByObra } from "@/utils/obraFilters";
import { useCallback } from "react";

export interface Fornecedor {
  id: string;
  nome: string;
  cnpj: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  tipo_fornecedor: string;
  categoria: string | null;
  observacoes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ObraFornecedor {
  id: string;
  obra_id: string;
  fornecedor_id: string;
  data_inicio: string;
  data_fim: string | null;
  tipo_contrato: string | null;
  valor_contrato: number | null;
  status: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  fornecedor?: Fornecedor;
  obra?: { id: string; nome: string; cliente_nome: string };
}

export type FornecedorInsert = Omit<Fornecedor, 'id' | 'created_at' | 'updated_at'>;
export type FornecedorUpdate = Partial<FornecedorInsert>;

export const useFornecedores = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { role, shouldFilterByObra, loading: loadingRole } = useUserRole();
  const { obraId, loading: loadingObra } = useUserObra();

  // O escopo vinha só de useUserObra, que procura a lotação do funcionário em
  // obra_funcionarios. Quem recebe o perfil aplicado a uma obra pelo Controle
  // de Acesso não está necessariamente lotado lá — e aí obraId ficava nulo e a
  // tela abria vazia, mesmo com a permissão certa e fornecedores na obra.
  //
  // A obra do perfil é a fonte principal; a lotação continua valendo como
  // segunda via, para quem ainda depende do modelo antigo. É o mesmo arranjo
  // que useVehicles já usa.
  const { obrasCom, loading: loadingPermissions } = usePermissions();
  const acessoFornecedores = obrasCom('fornecedores.visualizar');
  const obrasPermitidas = acessoFornecedores.ids.length
    ? acessoFornecedores.ids
    : (shouldFilterByObra && obraId ? [obraId] : []);
  const acessoEmpresa = acessoFornecedores.todas
    || role === 'admin' || role === 'gestor_contrato' || role === 'gestor_frota';

  const QK = ['fornecedores', acessoEmpresa, obrasPermitidas.join(',')] as const;

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      if (!acessoEmpresa && obrasPermitidas.length) {
        const porObra = await Promise.all(obrasPermitidas.map(getFornecedorIdsByObra));
        const ids = [...new Set(porObra.flat())];
        if (!ids.length) return [];
        const { data, error } = await supabase
          .from("fornecedores").select("*").in('id', ids).order("nome", { ascending: true });
        if (error) throw error;
        return (data ?? []) as Fornecedor[];
      }
      if (acessoEmpresa) {
        const { data, error } = await supabase
          .from("fornecedores").select("*").order("nome", { ascending: true });
        if (error) throw error;
        return (data ?? []) as Fornecedor[];
      }
      return [];
    },
    // Sem esperar as permissões, a primeira busca sai com escopo vazio e o
    // resultado vazio fica em cache até alguém recarregar a página.
    enabled: !loadingRole && !loadingObra && !loadingPermissions,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['fornecedores'] });

  const createMutation = useMutation({
    mutationFn: async (d: FornecedorInsert) => {
      const { data, error } = await supabase.from("fornecedores").insert(d).select().single();
      if (error) throw error;
      return data as Fornecedor;
    },
    onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Fornecedor cadastrado com sucesso!" }); },
    onError: (e: any) => toast({ title: "Erro ao cadastrar fornecedor", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: FornecedorUpdate }) => {
      const { data, error } = await supabase.from("fornecedores").update(d).eq("id", id).select().single();
      if (error) throw error;
      return data as Fornecedor;
    },
    onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Fornecedor atualizado com sucesso!" }); },
    onError: (e: any) => toast({ title: "Erro ao atualizar fornecedor", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fornecedores").update({ status: "inativo" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Fornecedor inativado com sucesso!" }); },
    onError: (e: any) => toast({ title: "Erro ao inativar fornecedor", description: e.message, variant: "destructive" }),
  });

  const linkFornecedorToObra = async (d: {
    obra_id: string; fornecedor_id: string; data_inicio?: string;
    tipo_contrato?: string; valor_contrato?: number; observacoes?: string;
  }) => {
    const { data: result, error } = await supabase.from("obra_fornecedores").insert({
      obra_id: d.obra_id, fornecedor_id: d.fornecedor_id,
      data_inicio: d.data_inicio || new Date().toISOString().split('T')[0],
      tipo_contrato: d.tipo_contrato || null,
      valor_contrato: d.valor_contrato || null,
      observacoes: d.observacoes || null,
    }).select().single();
    if (error) {
      toast({ title: "Erro ao vincular fornecedor", description: error.message, variant: "destructive" });
      throw error;
    }
    toast({ title: "Sucesso", description: "Fornecedor vinculado à obra com sucesso!" });
    return result;
  };

  const unlinkFornecedorFromObra = async (linkId: string) => {
    const { error } = await supabase.from("obra_fornecedores").update({
      status: false,
      data_fim: new Date().toISOString().split("T")[0],
    }).eq("id", linkId);
    if (error) {
      toast({ title: "Erro ao desvincular fornecedor", description: error.message, variant: "destructive" });
      throw error;
    }
    toast({ title: "Sucesso", description: "Vínculo encerrado e mantido no histórico." });
  };

  const getFornecedoresByObra = useCallback(async (obraId: string): Promise<ObraFornecedor[]> => {
    const { data, error } = await supabase
      .from("obra_fornecedores")
      .select(`*, fornecedor:fornecedores(*)`)
      .eq("obra_id", obraId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ObraFornecedor[];
  }, []);

  const getObrasByFornecedor = useCallback(async (fornecedorId: string): Promise<ObraFornecedor[]> => {
    const { data, error } = await supabase
      .from("obra_fornecedores")
      .select(`*, obra:obras(id, nome, cliente_nome)`)
      .eq("fornecedor_id", fornecedorId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ObraFornecedor[];
  }, []);

  return {
    fornecedores: query.data ?? [],
    loading: query.isLoading,
    fetchFornecedores: query.refetch,
    createFornecedor: (d: FornecedorInsert) => createMutation.mutateAsync(d),
    updateFornecedor: (id: string, d: FornecedorUpdate) => updateMutation.mutateAsync({ id, d }),
    deleteFornecedor: (id: string) => deleteMutation.mutateAsync(id),
    linkFornecedorToObra,
    unlinkFornecedorFromObra,
    getFornecedoresByObra,
    getObrasByFornecedor,
  };
};
