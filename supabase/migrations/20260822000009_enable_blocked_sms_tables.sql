-- Adiciona politicas seguras as tabelas SMS que tinham RLS, mas estavam
-- completamente bloqueadas para usuarios autenticados.

DROP POLICY IF EXISTS sms_colaborador_documentos_select_scoped
  ON public.sms_colaborador_documentos;
DROP POLICY IF EXISTS sms_colaborador_documentos_manage_scoped
  ON public.sms_colaborador_documentos;

CREATE POLICY sms_colaborador_documentos_select_scoped
  ON public.sms_colaborador_documentos FOR SELECT TO authenticated
  USING (public.can_access_employee_record(employee_id));

CREATE POLICY sms_colaborador_documentos_manage_scoped
  ON public.sms_colaborador_documentos FOR ALL TO authenticated
  USING (public.can_manage_sms_record(NULL, employee_id))
  WITH CHECK (public.can_manage_sms_record(NULL, employee_id));

DROP POLICY IF EXISTS sms_frentes_scoped ON public.sms_frentes;
CREATE POLICY sms_frentes_scoped
  ON public.sms_frentes FOR ALL TO authenticated
  USING (public.can_manage_sms_obra(obra_id))
  WITH CHECK (public.can_manage_sms_obra(obra_id));

DROP POLICY IF EXISTS sms_matriz_responsabilidade_scoped
  ON public.sms_matriz_responsabilidade;
CREATE POLICY sms_matriz_responsabilidade_scoped
  ON public.sms_matriz_responsabilidade FOR ALL TO authenticated
  USING (public.can_manage_sms_obra(obra_id))
  WITH CHECK (public.can_manage_sms_obra(obra_id));

DROP POLICY IF EXISTS sms_desvios_responsaveis_scoped
  ON public.sms_desvios_responsaveis;
CREATE POLICY sms_desvios_responsaveis_scoped
  ON public.sms_desvios_responsaveis FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sms_desvios desvio
      WHERE desvio.id = desvio_id
        AND public.can_manage_sms_record(desvio.obra_id, desvio.colaborador_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sms_desvios desvio
      WHERE desvio.id = desvio_id
        AND public.can_manage_sms_record(desvio.obra_id, desvio.colaborador_id)
    )
  );

DROP POLICY IF EXISTS sms_desvios_tratativas_scoped
  ON public.sms_desvios_tratativas;
CREATE POLICY sms_desvios_tratativas_scoped
  ON public.sms_desvios_tratativas FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sms_desvios desvio
      WHERE desvio.id = desvio_id
        AND public.can_manage_sms_record(desvio.obra_id, desvio.colaborador_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sms_desvios desvio
      WHERE desvio.id = desvio_id
        AND public.can_manage_sms_record(desvio.obra_id, desvio.colaborador_id)
    )
  );

DROP POLICY IF EXISTS sms_desvios_validacoes_scoped
  ON public.sms_desvios_validacoes;
CREATE POLICY sms_desvios_validacoes_scoped
  ON public.sms_desvios_validacoes FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sms_desvios desvio
      WHERE desvio.id = desvio_id
        AND public.can_manage_sms_record(desvio.obra_id, desvio.colaborador_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sms_desvios desvio
      WHERE desvio.id = desvio_id
        AND public.can_manage_sms_record(desvio.obra_id, desvio.colaborador_id)
    )
  );

DROP POLICY IF EXISTS sms_notificacoes_select_scoped ON public.sms_notificacoes;
DROP POLICY IF EXISTS sms_notificacoes_manage_scoped ON public.sms_notificacoes;

CREATE POLICY sms_notificacoes_select_scoped
  ON public.sms_notificacoes FOR SELECT TO authenticated
  USING (
    destinatario_id = public.get_user_employee_id()
    OR public.can_manage_sms_record(NULL, destinatario_id)
  );

CREATE POLICY sms_notificacoes_manage_scoped
  ON public.sms_notificacoes FOR ALL TO authenticated
  USING (public.can_manage_sms_record(NULL, destinatario_id))
  WITH CHECK (public.can_manage_sms_record(NULL, destinatario_id));

DROP POLICY IF EXISTS sms_sync_log_select_own ON public.sms_sync_log;
DROP POLICY IF EXISTS sms_sync_log_insert_own ON public.sms_sync_log;

CREATE POLICY sms_sync_log_select_own
  ON public.sms_sync_log FOR SELECT TO authenticated
  USING (
    employee_id = public.get_user_employee_id()
    OR public.can_manage_sms_record(NULL, employee_id)
  );

CREATE POLICY sms_sync_log_insert_own
  ON public.sms_sync_log FOR INSERT TO authenticated
  WITH CHECK (
    employee_id IS NOT NULL
    AND employee_id = public.get_user_employee_id()
  );
