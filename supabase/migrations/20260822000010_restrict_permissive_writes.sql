-- Fecha INSERT/UPDATE com validacao true que ainda permitiam falsificacao
-- de autoria ou alteracao de configuracao por qualquer conta autenticada.

DROP POLICY IF EXISTS notif_insert_auth ON public.escala_notificacoes;
DROP POLICY IF EXISTS notif_insert_manager ON public.escala_notificacoes;
CREATE POLICY notif_insert_manager
  ON public.escala_notificacoes FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_employee_record(employee_id));

DROP POLICY IF EXISTS fleet_config_insert ON public.fleet_config;
DROP POLICY IF EXISTS fleet_config_upsert ON public.fleet_config;
DROP POLICY IF EXISTS fleet_config_insert_manager ON public.fleet_config;
DROP POLICY IF EXISTS fleet_config_update_manager ON public.fleet_config;

CREATE POLICY fleet_config_insert_manager
  ON public.fleet_config FOR INSERT TO authenticated
  WITH CHECK (
    id = 1
    AND public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato')
  );

CREATE POLICY fleet_config_update_manager
  ON public.fleet_config FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato'))
  WITH CHECK (
    id = 1
    AND public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato')
  );

DROP POLICY IF EXISTS req_insert ON public.requisicoes_compra;
DROP POLICY IF EXISTS req_insert_scoped ON public.requisicoes_compra;
CREATE POLICY req_insert_scoped
  ON public.requisicoes_compra FOR INSERT TO authenticated
  WITH CHECK (
    solicitado_por = auth.uid()
    AND (
      obra_id = ANY(COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[]))
      OR public.can_manage_obra_data(obra_id)
    )
  );

DROP POLICY IF EXISTS req_itens_insert ON public.requisicao_itens;
DROP POLICY IF EXISTS req_itens_insert_scoped ON public.requisicao_itens;
CREATE POLICY req_itens_insert_scoped
  ON public.requisicao_itens FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.requisicoes_compra requisicao
      WHERE requisicao.id = requisicao_id
        AND (
          requisicao.solicitado_por = auth.uid()
          OR public.can_manage_obra_data(requisicao.obra_id)
        )
    )
  );

DROP POLICY IF EXISTS system_logs_insert_any ON public.system_logs;
DROP POLICY IF EXISTS system_logs_insert_own ON public.system_logs;
CREATE POLICY system_logs_insert_own
  ON public.system_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
