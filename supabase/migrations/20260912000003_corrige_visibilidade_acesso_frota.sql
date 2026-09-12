-- Corrige a transição do cadastro legado para o controle de acesso por perfil.

-- Diretório mínimo de usuários. A função evita abrir public.profiles por RLS e
-- só entrega os campos necessários a quem administra o Controle de Acesso.
CREATE OR REPLACE FUNCTION public.listar_usuarios_controle_acesso()
RETURNS TABLE(user_id uuid, nome text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
  SELECT p.user_id, p.nome::text, p.email::text
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL
    AND public.access_is_admin()
  ORDER BY p.nome NULLS LAST, p.email NULLS LAST
$$;

REVOKE ALL ON FUNCTION public.listar_usuarios_controle_acesso() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.listar_usuarios_controle_acesso() TO authenticated;

COMMENT ON FUNCTION public.listar_usuarios_controle_acesso() IS
  'Lista segura de contas para administração de acessos; exige controle_acesso.administrar.';

-- A regra antiga reconhecia somente user_roles.admin. Mantém o próprio perfil
-- visível e passa a reconhecer o administrador do modelo novo.
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.access_is_admin());

-- A leitura de veículos deixa de ser global para qualquer usuário autenticado.
-- Administradores da frota veem tudo; demais usuários somente veículo próprio
-- ou veículo de obra onde frota.visualizar foi concedida.
DROP POLICY IF EXISTS "All authenticated users can view vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Employees can view assigned vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Project managers can view obra vehicles" ON public.vehicles;
DROP POLICY IF EXISTS vehicles_select_scoped ON public.vehicles;
CREATE POLICY vehicles_select_scoped
ON public.vehicles FOR SELECT TO authenticated
USING (public.can_access_vehicle_record(id));
