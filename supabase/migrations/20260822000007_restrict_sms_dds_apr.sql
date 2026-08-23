-- Limita DDS e APR ao escopo de obra dos perfis autorizados do modulo SMS.

CREATE OR REPLACE FUNCTION public.can_manage_sms_obra(target_obra_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato', 'gestor_frota')
    OR (
      public.get_user_role(auth.uid()) IN ('gestor_obra', 'tecnico_sms')
      AND target_obra_id = ANY(
        COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[])
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_sms_obra(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_sms_obra(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_sms_obra(uuid) TO authenticated;

DROP POLICY IF EXISTS sms_p_dds_sessoes ON public.sms_dds_sessoes;
DROP POLICY IF EXISTS sms_dds_sessoes_scoped ON public.sms_dds_sessoes;
CREATE POLICY sms_dds_sessoes_scoped
  ON public.sms_dds_sessoes FOR ALL TO authenticated
  USING (public.can_manage_sms_obra(obra_id))
  WITH CHECK (public.can_manage_sms_obra(obra_id));

DROP POLICY IF EXISTS sms_p_dds_pres ON public.sms_dds_presencas;
DROP POLICY IF EXISTS sms_dds_presencas_scoped ON public.sms_dds_presencas;
CREATE POLICY sms_dds_presencas_scoped
  ON public.sms_dds_presencas FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sms_dds_sessoes sessao
      WHERE sessao.id = sessao_id
        AND public.can_manage_sms_obra(sessao.obra_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sms_dds_sessoes sessao
      WHERE sessao.id = sessao_id
        AND public.can_manage_sms_obra(sessao.obra_id)
    )
  );

DROP POLICY IF EXISTS sms_p_aprs ON public.sms_aprs;
DROP POLICY IF EXISTS sms_aprs_scoped ON public.sms_aprs;
CREATE POLICY sms_aprs_scoped
  ON public.sms_aprs FOR ALL TO authenticated
  USING (public.can_manage_sms_obra(obra_id))
  WITH CHECK (public.can_manage_sms_obra(obra_id));

DROP POLICY IF EXISTS sms_p_apr_risk_sel ON public.sms_apr_riscos_selecionados;
DROP POLICY IF EXISTS sms_apr_riscos_selecionados_scoped ON public.sms_apr_riscos_selecionados;
CREATE POLICY sms_apr_riscos_selecionados_scoped
  ON public.sms_apr_riscos_selecionados FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sms_aprs apr
      WHERE apr.id = apr_id
        AND public.can_manage_sms_obra(apr.obra_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sms_aprs apr
      WHERE apr.id = apr_id
        AND public.can_manage_sms_obra(apr.obra_id)
    )
  );

DROP POLICY IF EXISTS sms_p_apr_env ON public.sms_apr_envolvidos;
DROP POLICY IF EXISTS sms_apr_envolvidos_scoped ON public.sms_apr_envolvidos;
CREATE POLICY sms_apr_envolvidos_scoped
  ON public.sms_apr_envolvidos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sms_aprs apr
      WHERE apr.id = apr_id
        AND public.can_manage_sms_obra(apr.obra_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sms_aprs apr
      WHERE apr.id = apr_id
        AND public.can_manage_sms_obra(apr.obra_id)
    )
  );
