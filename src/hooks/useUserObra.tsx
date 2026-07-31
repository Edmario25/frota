import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useUserObra = () => {
  const { user } = useAuth();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['userObra', user?.id],
    queryFn: async (): Promise<{ obraId: string | null; obraNome: string | null }> => {
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (!emp?.id) return { obraId: null, obraNome: null };

      const { data: of1 } = await (supabase as any)
        .from('obra_funcionarios')
        .select('obra_id')
        .eq('employee_id', emp.id)
        .eq('status', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!of1?.obra_id) return { obraId: null, obraNome: null };

      const { data: obra } = await (supabase as any)
        .from('obras')
        .select('nome')
        .eq('id', of1.obra_id)
        .maybeSingle();

      return { obraId: of1.obra_id, obraNome: obra?.nome ?? null };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // vínculo com obra muda raramente — 5 min
  });

  return {
    obraId: data?.obraId ?? null,
    obraNome: data?.obraNome ?? null,
    loading,
  };
};
