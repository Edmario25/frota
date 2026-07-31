import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = 'gestor_contrato' | 'gestor_obra' | 'funcionario' | 'admin' | 'gestor_frota';

export const useUserRole = () => {
  const { user } = useAuth();

  const { data: role = null, isLoading: loading } = useQuery({
    queryKey: ['userRole', user?.id],
    queryFn: async (): Promise<AppRole | null> => {
      if (!user) return null;
      try {
        const { data, error } = await supabase.rpc('get_user_role', { user_uuid: user.id });
        if (error) return 'funcionario';
        return (data as AppRole) || 'funcionario';
      } catch {
        return 'funcionario';
      }
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // role muda raramente — 5 min
  });

  const isGestorContrato = role === 'gestor_contrato' || role === 'admin' || role === 'gestor_frota';
  const isGestorObra = role === 'gestor_obra';
  const isFuncionario = role === 'funcionario';

  const isAdmin = isGestorContrato;
  const isGestorFrota = isGestorContrato;
  const hasAdminAccess = isGestorContrato;
  const hasObraManagement = isGestorContrato || isGestorObra;
  const hasEscalaManagement = isGestorContrato || isGestorObra;
  const shouldFilterByObra = isGestorObra;
  const hasFullAccess = isGestorContrato;

  return {
    role,
    loading,
    isGestorContrato,
    isGestorObra,
    isFuncionario,
    isAdmin,
    isGestorFrota,
    hasAdminAccess,
    hasObraManagement,
    hasEscalaManagement,
    shouldFilterByObra,
    hasFullAccess,
  };
};
