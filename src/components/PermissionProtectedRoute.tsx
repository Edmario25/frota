import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";

type Props = {
  children: ReactNode;
  permission: string;
  legacyRoles?: AppRole[];
  redirectTo?: string;
};

/** Protege a URL, enquanto legacyRoles mantém a transição sem bloquear usuários atuais. */
export function PermissionProtectedRoute({ children, permission, legacyRoles = [], redirectTo = "/" }: Props) {
  const { role, loading: roleLoading } = useUserRole();
  const { canAction, loading: permissionLoading } = usePermissions();
  if (roleLoading || permissionLoading) {
    return <div className="min-h-screen grid place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }
  const allowed = canAction(permission) || (!!role && legacyRoles.includes(role));
  return allowed ? <>{children}</> : <Navigate to={redirectTo} replace />;
}
