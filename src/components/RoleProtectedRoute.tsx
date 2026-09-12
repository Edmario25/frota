import { useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { permissionForPath } from "@/lib/accessMap";
import { AcessoNegado } from "@/components/access/AcessoNegado";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database['public']['Enums']['app_role'];

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  /** Obsoleto: o acesso vem só do perfil (src/lib/accessMap.ts). Mantido para não mexer em todas as rotas. */
  allowedRoles?: AppRole[];
  redirectTo?: string;
}

/** Protege a rota pela permissão do mapa único — a mesma que o menu usa. */
export const RoleProtectedRoute = ({ children }: RoleProtectedRouteProps) => {
  const { canAction, loading } = usePermissions();
  const location = useLocation();
  const permission = permissionForPath(location.pathname);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  if (permission && !canAction(permission)) return <AcessoNegado permission={permission} />;

  return <>{children}</>;
};
