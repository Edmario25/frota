import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { AcessoNegado } from "@/components/access/AcessoNegado";

type Props = {
  children: ReactNode;
  permission: string;
};

/** Protege a URL por uma permissão explícita do perfil de acesso. */
export function PermissionProtectedRoute({ children, permission }: Props) {
  const { canAction, loading } = usePermissions();
  if (loading) {
    return <div className="min-h-screen grid place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }
  return canAction(permission) ? <>{children}</> : <AcessoNegado permission={permission} />;
}
