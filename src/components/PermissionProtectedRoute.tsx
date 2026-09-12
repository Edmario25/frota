import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import { AcessoNegado } from "@/components/access/AcessoNegado";

type Props = {
  children: ReactNode;
  permission: string;
  legacyRoles?: AppRole[];
  redirectTo?: string;
};

/** Protege a URL, enquanto legacyRoles mantém a transição sem bloquear usuários atuais. */
export function PermissionProtectedRoute({ children, permission, legacyRoles = [] }: Props) {
  const { role, loading: roleLoading } = useUserRole();
  const { canAction, accessProfiles, loading: permissionLoading } = usePermissions();
  if (roleLoading || permissionLoading) {
    return <div className="min-h-screen grid place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }
  const allowed = accessProfiles.length > 0
    ? canAction(permission)
    : canAction(permission) || (!!role && legacyRoles.includes(role));
  return allowed ? <>{children}</> : <AcessoNegado permission={permission} />;
}
