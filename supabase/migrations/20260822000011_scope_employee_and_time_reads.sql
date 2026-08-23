-- Remove leituras globais que anulavam politicas por usuario/obra e corrige
-- a escrita de ponto de campo para validar obra, colaborador e autoria.

CREATE OR REPLACE FUNCTION public.is_employee_assigned_to_obra(
  target_employee_id uuid,
  target_obra_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_obra_assignments assignment
    WHERE assignment.employee_id = target_employee_id
      AND assignment.obra_id = target_obra_id
    UNION ALL
    SELECT 1
    FROM public.obra_funcionarios assignment
    WHERE assignment.employee_id = target_employee_id
      AND assignment.obra_id = target_obra_id
      AND assignment.status = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_employee_assigned_to_obra(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_employee_assigned_to_obra(uuid, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.is_employee_assigned_to_obra(uuid, uuid)
  TO authenticated;

DROP POLICY IF EXISTS employees_select_authenticated ON public.employees;
DROP POLICY IF EXISTS employees_select_scoped ON public.employees;
CREATE POLICY employees_select_scoped
  ON public.employees FOR SELECT TO authenticated
  USING (public.can_access_employee_record(id));

DROP POLICY IF EXISTS eoa_select_all_auth ON public.employee_obra_assignments;
DROP POLICY IF EXISTS eoa_select_scoped ON public.employee_obra_assignments;
CREATE POLICY eoa_select_scoped
  ON public.employee_obra_assignments FOR SELECT TO authenticated
  USING (
    employee_id = public.get_user_employee_id()
    OR public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato', 'gestor_frota')
    OR obra_id = ANY(COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[]))
  );

DROP POLICY IF EXISTS eoa_write_gestores ON public.employee_obra_assignments;
DROP POLICY IF EXISTS eoa_manage_scoped ON public.employee_obra_assignments;
CREATE POLICY eoa_manage_scoped
  ON public.employee_obra_assignments FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS efetivo_select_auth ON public.efetivo_ponto;
DROP POLICY IF EXISTS efetivo_ponto_select_authenticated ON public.efetivo_ponto;
DROP POLICY IF EXISTS efetivo_write_gestores ON public.efetivo_ponto;
DROP POLICY IF EXISTS efetivo_ponto_insert_campo ON public.efetivo_ponto;
DROP POLICY IF EXISTS efetivo_ponto_update_campo ON public.efetivo_ponto;
DROP POLICY IF EXISTS efetivo_ponto_select_scoped ON public.efetivo_ponto;
DROP POLICY IF EXISTS efetivo_ponto_manage_scoped ON public.efetivo_ponto;
DROP POLICY IF EXISTS efetivo_ponto_insert_campo_scoped ON public.efetivo_ponto;
DROP POLICY IF EXISTS efetivo_ponto_update_campo_scoped ON public.efetivo_ponto;

CREATE POLICY efetivo_ponto_select_scoped
  ON public.efetivo_ponto FOR SELECT TO authenticated
  USING (
    employee_id = public.get_user_employee_id()
    OR obra_id = ANY(COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[]))
    OR public.can_manage_obra_data(obra_id)
  );

CREATE POLICY efetivo_ponto_manage_scoped
  ON public.efetivo_ponto FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (
    public.can_manage_obra_data(obra_id)
    AND public.is_employee_assigned_to_obra(employee_id, obra_id)
  );

CREATE POLICY efetivo_ponto_insert_campo_scoped
  ON public.efetivo_ponto FOR INSERT TO authenticated
  WITH CHECK (
    fonte = 'campo'
    AND registrado_por = auth.uid()
    AND obra_id = ANY(COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[]))
    AND public.is_employee_assigned_to_obra(employee_id, obra_id)
  );

CREATE POLICY efetivo_ponto_update_campo_scoped
  ON public.efetivo_ponto FOR UPDATE TO authenticated
  USING (
    fonte = 'campo'
    AND obra_id = ANY(COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[]))
  )
  WITH CHECK (
    fonte = 'campo'
    AND registrado_por = auth.uid()
    AND obra_id = ANY(COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[]))
    AND public.is_employee_assigned_to_obra(employee_id, obra_id)
  );
