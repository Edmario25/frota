import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { EmployeeWithRelations } from "./useEmployees";

export const useCurrentEmployee = () => {
  const { user } = useAuth();

  const { data: employee = null, isLoading: loading } = useQuery({
    queryKey: ['currentEmployee', user?.id],
    queryFn: async (): Promise<EmployeeWithRelations | null> => {
      const { data, error } = await supabase
        .from('employees')
        .select(`*, cargos(nome), departamentos!fk_employees_departamento(nome)`)
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar funcionário atual:', error);
        return null;
      }
      if (!data) return null;

      // Usa RPC para garantir o valor correto de acesso_app_motorista
      // (bypass do cache de schema do PostgREST)
      const { data: appAccess } = await supabase.rpc(
        'check_user_app_access' as any,
        { p_user_id: user!.id }
      );

      return { ...data, acesso_app_motorista: appAccess === true };
    },
    enabled: !!user,
  });

  return { employee, loading };
};
