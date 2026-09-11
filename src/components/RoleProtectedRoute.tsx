import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database['public']['Enums']['app_role'];

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: AppRole[];
  redirectTo?: string;
}

export const RoleProtectedRoute = ({ 
  children, 
  allowedRoles, 
  redirectTo = "/" 
}: RoleProtectedRouteProps) => {
  const { role, loading } = useUserRole();
  const { canAction, loading: permissionsLoading } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const routePermissions: Array<[string, string]> = [
    ["/funcionarios", "colaboradores.visualizar"], ["/cargos", "controle_acesso.administrar"],
    ["/frota", "frota.visualizar"], ["/veiculos-pesados", "frota.visualizar"], ["/manutencao", "manutencao.visualizar"],
    ["/escalas", "escalas.visualizar"], ["/efetivo", "efetivo.visualizar"], ["/ponto-qr", "efetivo.visualizar"],
    ["/obras", "obras.visualizar"], ["/fornecedores", "fornecedores.visualizar"], ["/almoxarifado", "almoxarifado.visualizar"],
    ["/ferramentas", "ferramentas.visualizar"], ["/cronograma", "cronograma.visualizar"], ["/subcontratadas", "subcontratadas.visualizar"],
    ["/orcado-realizado", "financeiro.visualizar"], ["/fundo-fixo", "fundo_fixo.visualizar"], ["/alojamentos", "alojamento.visualizar"],
    ["/relatorio-folha", "rh_sensivel.visualizar"], ["/relatorios", "relatorios.visualizar"], ["/portal-cliente", "portal_cliente.visualizar"],
    ["/qualidade", "qualidade.visualizar"], ["/nao-conformidades", "qualidade.visualizar"], ["/comunicados", "comunicados.visualizar"],
    ["/visitantes", "visitantes.visualizar"], ["/sms/desvios", "sms_desvios.visualizar"], ["/sms/ocorrencias", "sms_desvios.visualizar"],
    ["/sms/inspecoes", "sms_inspecoes.visualizar"], ["/sms/apr", "sms_apr.visualizar"], ["/sms/dds", "sms_dds.visualizar"],
    ["/sms/epis", "sms_epis.visualizar"], ["/sms/treinamentos", "sms_treinamentos.visualizar"], ["/sms/conformidade", "sms_treinamentos.visualizar"],
    ["/sms/admissao", "sms_admissao.visualizar"], ["/sms/rdo", "sms_rdo.visualizar"], ["/sms/velocidade", "sms_velocidade.visualizar"],
    ["/sms", "sms_dashboard.visualizar"], ["/auditoria", "auditoria.visualizar"], ["/configuracoes", "controle_acesso.administrar"],
    ["/departamentos", "controle_acesso.administrar"],
  ];
  const granularPermission = routePermissions.find(([path]) => location.pathname === path || location.pathname.startsWith(path + "/"))?.[1];
  const permitted = (!!role && allowedRoles.includes(role)) || (!!granularPermission && canAction(granularPermission));

  useEffect(() => {
    if (!loading && !permissionsLoading && !permitted) {
      navigate(redirectTo);
    }
  }, [loading, permissionsLoading, permitted, redirectTo, navigate]);

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

  if (!permitted) {
    return null;
  }

  return <>{children}</>;
};
