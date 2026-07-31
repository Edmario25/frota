import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type InspectionChecklist = Database['public']['Tables']['inspection_checklists']['Row'];
type InspectionChecklistInsert = Database['public']['Tables']['inspection_checklists']['Insert'];
type InspectionItemInsert = Database['public']['Tables']['inspection_items']['Insert'];

const QK = ['inspectionChecklists'] as const;

export const useInspectionChecklist = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspection_checklists')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const createMutation = useMutation({
    mutationFn: async (d: InspectionChecklistInsert) => {
      const { data, error } = await supabase.from('inspection_checklists').insert([d]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Checklist criado", description: "O checklist foi criado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao criar checklist", description: e.message, variant: "destructive" }),
  });

  const createChecklistItem = async (d: InspectionItemInsert) => {
    const { data, error } = await supabase.from('inspection_items').insert([d]).select().single();
    if (error) {
      toast({ title: "Erro ao adicionar item", description: error.message, variant: "destructive" });
      throw error;
    }
    toast({ title: "Item adicionado", description: "Item do checklist adicionado com sucesso." });
    return data;
  };

  const getChecklistItems = async (checklistId: string) => {
    const { data, error } = await supabase
      .from('inspection_items')
      .select('*')
      .eq('checklist_id', checklistId)
      .order('created_at', { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar itens do checklist", description: error.message, variant: "destructive" });
      return [];
    }
    return data ?? [];
  };

  return {
    checklists: query.data ?? [],
    loading: query.isLoading,
    createChecklist: (d: InspectionChecklistInsert) => createMutation.mutateAsync(d),
    createChecklistItem,
    getChecklistItems,
    refetchChecklists: query.refetch,
  };
};
