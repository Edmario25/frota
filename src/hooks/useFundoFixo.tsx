import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserObra } from "@/hooks/useUserObra";
import type { Database } from "@/integrations/supabase/types";

type FundoFixo = Database['public']['Tables']['fundo_fixo']['Row'];
type FundoFixoInsert = Database['public']['Tables']['fundo_fixo']['Insert'];
type FundoFixoLancamento = Database['public']['Tables']['fundo_fixo_lancamentos']['Row'];
type FundoFixoLancamentoInsert = Database['public']['Tables']['fundo_fixo_lancamentos']['Insert'];
type FundoFixoLancamentoUpdate = Database['public']['Tables']['fundo_fixo_lancamentos']['Update'];

export type { FundoFixo, FundoFixoLancamento };

export const useFundoFixo = () => {
  const [fundo, setFundo] = useState<FundoFixo | null>(null);
  const [lancamentos, setLancamentos] = useState<FundoFixoLancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { shouldFilterByObra, hasFullAccess } = useUserRole();
  const { obraId, loading: loadingObra } = useUserObra();

  // Para admin — todos os fundos de todas as obras
  const [allFundos, setAllFundos] = useState<FundoFixo[]>([]);

  const fetchFundo = useCallback(async () => {
    if (!obraId) return;
    try {
      const { data, error } = await (supabase as any)
        .from('fundo_fixo')
        .select('*')
        .eq('obra_id', obraId)
        .eq('status', 'ativo')
        .maybeSingle();

      if (error) throw error;
      setFundo(data);

      if (data) {
        await fetchLancamentos(data.id);
      }
    } catch (error: any) {
      console.error('Erro ao buscar fundo fixo:', error);
    }
  }, [obraId]);

  const fetchAllFundos = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('fundo_fixo')
        .select('*, obras(nome)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAllFundos(data || []);
    } catch (error: any) {
      console.error('Erro ao buscar todos os fundos:', error);
    }
  }, []);

  const fetchLancamentos = async (fundoId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('fundo_fixo_lancamentos')
        .select('*')
        .eq('fundo_fixo_id', fundoId)
        .order('data_lancamento', { ascending: false });

      if (error) throw error;
      setLancamentos(data || []);
    } catch (error: any) {
      console.error('Erro ao buscar lançamentos:', error);
    }
  };

  const createFundo = async (data: FundoFixoInsert) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: created, error } = await (supabase as any)
        .from('fundo_fixo')
        .insert([{ ...data, created_by: user?.id }])
        .select()
        .single();

      if (error) throw error;
      setFundo(created);
      if (hasFullAccess) fetchAllFundos();
      toast({ title: "Fundo criado", description: "Fundo fixo criado com sucesso." });
      return created;
    } catch (error: any) {
      toast({ title: "Erro ao criar fundo", description: error.message, variant: "destructive" });
      throw error;
    }
  };

  const updateFundo = async (id: string, data: Partial<FundoFixo>) => {
    try {
      const { data: updated, error } = await (supabase as any)
        .from('fundo_fixo')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setFundo(updated);
      toast({ title: "Fundo atualizado" });
      return updated;
    } catch (error: any) {
      toast({ title: "Erro ao atualizar fundo", description: error.message, variant: "destructive" });
      throw error;
    }
  };

  const createLancamento = async (data: FundoFixoLancamentoInsert) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: created, error } = await (supabase as any)
        .from('fundo_fixo_lancamentos')
        .insert([{ ...data, created_by: user?.id }])
        .select()
        .single();

      if (error) throw error;

      setLancamentos(prev => [created, ...prev]);
      // Atualizar saldo do fundo (trigger faz no banco, recarregar localmente)
      if (fundo) {
        const multiplier = created.tipo === 'entrada' ? 1 : -1;
        setFundo(prev => prev ? { ...prev, saldo_atual: prev.saldo_atual + (created.valor * multiplier) } : prev);
      }

      toast({ title: "Lançamento registrado", description: "Lançamento adicionado ao fundo fixo." });
      return created;
    } catch (error: any) {
      toast({ title: "Erro ao registrar lançamento", description: error.message, variant: "destructive" });
      throw error;
    }
  };

  const updateLancamento = async (id: string, data: FundoFixoLancamentoUpdate) => {
    try {
      const { data: updated, error } = await (supabase as any)
        .from('fundo_fixo_lancamentos')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setLancamentos(prev => prev.map(l => l.id === id ? updated : l));
      // Recarregar saldo
      if (fundo) await fetchFundo();
      toast({ title: "Lançamento atualizado" });
      return updated;
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      throw error;
    }
  };

  const deleteLancamento = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from('fundo_fixo_lancamentos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setLancamentos(prev => prev.filter(l => l.id !== id));
      if (fundo) await fetchFundo();
      toast({ title: "Lançamento excluído" });
    } catch (error: any) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      throw error;
    }
  };

  useEffect(() => {
    if (loadingObra) return;

    const load = async () => {
      setLoading(true);
      try {
        if (hasFullAccess) {
          await fetchAllFundos();
        }
        if (obraId) {
          await fetchFundo();
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [obraId, loadingObra, hasFullAccess]);

  return {
    fundo,
    lancamentos,
    allFundos,
    loading,
    createFundo,
    updateFundo,
    createLancamento,
    updateLancamento,
    deleteLancamento,
    refetch: fetchFundo,
    refetchLancamentos: () => fundo ? fetchLancamentos(fundo.id) : Promise.resolve(),
  };
};
