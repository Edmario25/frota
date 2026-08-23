-- Restringe RH, documentos, férias, banco de horas e ponto por usuário/obra.

CREATE OR REPLACE FUNCTION public.can_access_employee_record(target_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.employees e
            WHERE e.id = target_employee_id AND e.user_id = auth.uid())
    OR public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato', 'gestor_frota')
    OR (
      public.get_user_role(auth.uid()) IN ('gestor_obra', 'tecnico_sms')
      AND EXISTS (
        SELECT 1
        FROM (
          SELECT obra_id FROM public.employee_obra_assignments WHERE employee_id = target_employee_id
          UNION
          SELECT obra_id FROM public.obra_funcionarios WHERE employee_id = target_employee_id AND status = true
        ) target_assignment
        JOIN (
          SELECT a.obra_id FROM public.employee_obra_assignments a
          JOIN public.employees e ON e.id = a.employee_id WHERE e.user_id = auth.uid()
          UNION
          SELECT a.obra_id FROM public.obra_funcionarios a
          JOIN public.employees e ON e.id = a.employee_id
          WHERE e.user_id = auth.uid() AND a.status = true
        ) current_assignment USING (obra_id)
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_employee_record(target_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
  SELECT
    public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato', 'gestor_frota')
    OR (
      public.get_user_role(auth.uid()) = 'gestor_obra'
      AND EXISTS (
        SELECT 1
        FROM (
          SELECT obra_id FROM public.employee_obra_assignments WHERE employee_id = target_employee_id
          UNION
          SELECT obra_id FROM public.obra_funcionarios WHERE employee_id = target_employee_id AND status = true
        ) target_assignment
        JOIN (
          SELECT a.obra_id FROM public.employee_obra_assignments a
          JOIN public.employees e ON e.id = a.employee_id WHERE e.user_id = auth.uid()
          UNION
          SELECT a.obra_id FROM public.obra_funcionarios a
          JOIN public.employees e ON e.id = a.employee_id
          WHERE e.user_id = auth.uid() AND a.status = true
        ) current_assignment USING (obra_id)
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.can_access_employee_record(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_employee_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_employee_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_employee_record(uuid) TO authenticated;

DROP POLICY IF EXISTS rh_all ON public.employee_dados_rh;
CREATE POLICY rh_select_scoped ON public.employee_dados_rh
  FOR SELECT TO authenticated
  USING (public.can_access_employee_record(employee_id));
CREATE POLICY rh_manage_scoped ON public.employee_dados_rh
  FOR ALL TO authenticated
  USING (public.can_manage_employee_record(employee_id))
  WITH CHECK (public.can_manage_employee_record(employee_id));

DROP POLICY IF EXISTS docs_all ON public.employee_documentos;
CREATE POLICY employee_docs_select_scoped ON public.employee_documentos
  FOR SELECT TO authenticated
  USING (public.can_access_employee_record(employee_id));
CREATE POLICY employee_docs_manage_scoped ON public.employee_documentos
  FOR ALL TO authenticated
  USING (public.can_manage_employee_record(employee_id))
  WITH CHECK (public.can_manage_employee_record(employee_id));

DROP POLICY IF EXISTS fer_all ON public.employee_ferias;
CREATE POLICY employee_leave_select_scoped ON public.employee_ferias
  FOR SELECT TO authenticated
  USING (public.can_access_employee_record(employee_id));
CREATE POLICY employee_leave_manage_scoped ON public.employee_ferias
  FOR ALL TO authenticated
  USING (public.can_manage_employee_record(employee_id))
  WITH CHECK (public.can_manage_employee_record(employee_id));

DROP POLICY IF EXISTS banco_horas_all ON public.banco_horas_lancamentos;
CREATE POLICY hours_bank_select_scoped ON public.banco_horas_lancamentos
  FOR SELECT TO authenticated
  USING (public.can_access_employee_record(employee_id));
CREATE POLICY hours_bank_manage_scoped ON public.banco_horas_lancamentos
  FOR ALL TO authenticated
  USING (public.can_manage_employee_record(employee_id))
  WITH CHECK (public.can_manage_employee_record(employee_id));

DROP POLICY IF EXISTS ponto_qr_all ON public.employee_ponto_qr;
CREATE POLICY employee_qr_point_select_scoped ON public.employee_ponto_qr
  FOR SELECT TO authenticated
  USING (public.can_access_employee_record(employee_id));
CREATE POLICY employee_qr_point_insert_scoped ON public.employee_ponto_qr
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_employee_record(employee_id)
    OR (
      public.get_user_role(auth.uid()) = 'tecnico_sms'
      AND public.can_access_employee_record(employee_id)
    )
  );
CREATE POLICY employee_qr_point_update_scoped ON public.employee_ponto_qr
  FOR UPDATE TO authenticated
  USING (public.can_manage_employee_record(employee_id))
  WITH CHECK (public.can_manage_employee_record(employee_id));
CREATE POLICY employee_qr_point_delete_scoped ON public.employee_ponto_qr
  FOR DELETE TO authenticated
  USING (public.can_manage_employee_record(employee_id));
