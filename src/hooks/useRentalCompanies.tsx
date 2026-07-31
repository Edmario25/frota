import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type RentalCompany = Database['public']['Tables']['rental_companies']['Row'];
type RentalCompanyInsert = Database['public']['Tables']['rental_companies']['Insert'];
type RentalCompanyUpdate = Database['public']['Tables']['rental_companies']['Update'];

const QK = ['rentalCompanies'] as const;

export const useRentalCompanies = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase.from('rental_companies').select('*').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: async (d: RentalCompanyInsert) => {
      const { data, error } = await supabase.from('rental_companies').insert([d]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Locadora cadastrada", description: "A locadora foi cadastrada com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao cadastrar locadora", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: RentalCompanyUpdate }) => {
      const { data, error } = await supabase.from('rental_companies').update(d).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Locadora atualizada", description: "A locadora foi atualizada com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar locadora", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rental_companies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Locadora excluída", description: "A locadora foi excluída com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir locadora", description: e.message, variant: "destructive" }),
  });

  return {
    rentalCompanies: query.data ?? [],
    loading: query.isLoading,
    createRentalCompany: (d: RentalCompanyInsert) => createMutation.mutateAsync(d),
    updateRentalCompany: (id: string, d: RentalCompanyUpdate) => updateMutation.mutateAsync({ id, d }),
    deleteRentalCompany: (id: string) => deleteMutation.mutateAsync(id),
    refetchRentalCompanies: query.refetch,
  };
};
