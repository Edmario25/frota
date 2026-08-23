-- Isola leituras operacionais restantes por obra/veiculo.

CREATE OR REPLACE FUNCTION public.can_access_obra_data(target_obra_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato', 'gestor_frota')
    OR target_obra_id = ANY(
      COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[])
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_vehicle_record(target_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato', 'gestor_frota')
    OR EXISTS (
      SELECT 1 FROM public.vehicles vehicle
      WHERE vehicle.id = target_vehicle_id
        AND vehicle.responsavel_id = public.get_user_employee_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.obra_veiculos assignment
      WHERE assignment.vehicle_id = target_vehicle_id
        AND public.can_access_obra_data(assignment.obra_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_obra_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_obra_data(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_access_vehicle_record(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_vehicle_record(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_obra_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_vehicle_record(uuid) TO authenticated;

DROP POLICY IF EXISTS obras_select_authenticated ON public.obras;
DROP POLICY IF EXISTS obras_select_scoped ON public.obras;
CREATE POLICY obras_select_scoped
  ON public.obras FOR SELECT TO authenticated
  USING (public.can_access_obra_data(id));

DROP POLICY IF EXISTS cron_itens_select ON public.cronograma_itens;
DROP POLICY IF EXISTS cron_itens_write ON public.cronograma_itens;
DROP POLICY IF EXISTS cronograma_itens_scoped ON public.cronograma_itens;
CREATE POLICY cronograma_itens_scoped
  ON public.cronograma_itens FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS cron_avancos_select ON public.cronograma_avancos;
DROP POLICY IF EXISTS cron_avancos_write ON public.cronograma_avancos;
DROP POLICY IF EXISTS cronograma_avancos_scoped ON public.cronograma_avancos;
CREATE POLICY cronograma_avancos_scoped
  ON public.cronograma_avancos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cronograma_itens item
      WHERE item.id = item_id AND public.can_manage_obra_data(item.obra_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cronograma_itens item
      WHERE item.id = item_id AND public.can_manage_obra_data(item.obra_id)
    )
  );

DROP POLICY IF EXISTS ferr_aloc_select ON public.ferramentas_alocacao;
DROP POLICY IF EXISTS ferr_aloc_write ON public.ferramentas_alocacao;
DROP POLICY IF EXISTS ferramentas_alocacao_scoped ON public.ferramentas_alocacao;
CREATE POLICY ferramentas_alocacao_scoped
  ON public.ferramentas_alocacao FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (
    public.can_manage_obra_data(obra_id)
    AND (
      responsavel_id IS NULL
      OR public.is_employee_assigned_to_obra(responsavel_id, obra_id)
    )
  );

DROP POLICY IF EXISTS ferr_cert_select ON public.ferramentas_certificacoes;
DROP POLICY IF EXISTS ferr_cert_write ON public.ferramentas_certificacoes;
DROP POLICY IF EXISTS ferramentas_certificacoes_scoped
  ON public.ferramentas_certificacoes;
CREATE POLICY ferramentas_certificacoes_scoped
  ON public.ferramentas_certificacoes FOR ALL TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato', 'gestor_frota')
    OR EXISTS (
      SELECT 1 FROM public.ferramentas_alocacao allocation
      WHERE allocation.ferramenta_id = ferramenta_id
        AND public.can_manage_obra_data(allocation.obra_id)
    )
  )
  WITH CHECK (
    public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato', 'gestor_frota')
    OR EXISTS (
      SELECT 1 FROM public.ferramentas_alocacao allocation
      WHERE allocation.ferramenta_id = ferramenta_id
        AND public.can_manage_obra_data(allocation.obra_id)
    )
  );

DROP POLICY IF EXISTS sms_obra_empresas_select ON public.sms_obra_empresas;
DROP POLICY IF EXISTS sms_obra_empresas_write ON public.sms_obra_empresas;
DROP POLICY IF EXISTS sms_obra_empresas_scoped ON public.sms_obra_empresas;
CREATE POLICY sms_obra_empresas_scoped
  ON public.sms_obra_empresas FOR ALL TO authenticated
  USING (public.can_manage_sms_obra(obra_id))
  WITH CHECK (public.can_manage_sms_obra(obra_id));

DROP POLICY IF EXISTS "authenticated can read km cycles"
  ON public.vehicle_km_cycles;
DROP POLICY IF EXISTS vehicle_km_cycles_select_scoped
  ON public.vehicle_km_cycles;
CREATE POLICY vehicle_km_cycles_select_scoped
  ON public.vehicle_km_cycles FOR SELECT TO authenticated
  USING (public.can_access_vehicle_record(vehicle_id));

ALTER VIEW public.v_cronograma_situacao SET (security_invoker = true);
ALTER VIEW public.v_ferramentas_situacao SET (security_invoker = true);
