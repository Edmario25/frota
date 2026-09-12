import { useLocation } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import { permissionForPath } from "@/lib/accessMap";
import { AcessoNegado } from "@/components/access/AcessoNegado";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database['public']['Enums']['app_role'];

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  /** Regra antiga: vale só para quem ainda não recebeu perfil de acesso. */
  allowedRoles: AppRole[];
  redirectTo?: string;
}

export const RoleProtectedRoute = ({ children, allowedRoles }: RoleProtectedRouteProps) => {
  const { role, loading } = useUserRole();
  const { canAction, accessProfiles, loading: permissionsLoading } = usePermissions();
  const location = useLocation();
  // Mesma permissão que o menu usa para mostrar o item (src/lib/accessMap.ts)
  const permission = permissionForPath(location.pathname);

  if (loading || permissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // Assim que o usuário possui perfil novo, o papel legado deixa de ser um atalho.
  const permitted = accessProfiles.length > 0
    ? !permission || canAction(permission)
    : (!!role && (allowedRoles as string[]).includes(role)) || (!!permission && canAction(permission));

  if (!permitted) return <AcessoNegado permission={permission} />;

  return <>{children}</>;
};
