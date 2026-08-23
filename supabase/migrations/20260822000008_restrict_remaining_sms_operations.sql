-- Fecha as politicas ALL restantes do modulo SMS por obra/colaborador.

CREATE OR REPLACE FUNCTION public.can_manage_sms_record(
  target_obra_id uuid,
  target_employee_id uuid DEFAULT NULL
)
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
      AND (
        target_obra_id = ANY(
          COALESCE(public.get_user_obra_ids(), ARRAY[]::uuid[])
        )
        OR (
          target_employee_id IS NOT NULL
          AND public.can_access_employee_record(target_employee_id)
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_sms_record(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_sms_record(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_sms_record(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS sms_p_admissoes ON public.sms_admissoes;
DROP POLICY IF EXISTS sms_admissoes_scoped ON public.sms_admissoes;
CREATE POLICY sms_admissoes_scoped
  ON public.sms_admissoes FOR ALL TO authenticated
  USING (public.can_manage_sms_record(obra_id, colaborador_id))
  WITH CHECK (public.can_manage_sms_record(obra_id, colaborador_id));

DROP POLICY IF EXISTS sms_p_epis_col ON public.sms_colaborador_epis;
DROP POLICY IF EXISTS sms_colaborador_epis_scoped ON public.sms_colaborador_epis;
CREATE POLICY sms_colaborador_epis_scoped
  ON public.sms_colaborador_epis FOR ALL TO authenticated
  USING (public.can_manage_sms_record(obra_id, colaborador_id))
  WITH CHECK (public.can_manage_sms_record(obra_id, colaborador_id));

DROP POLICY IF EXISTS sms_p_trein_col ON public.sms_colaborador_treinamentos;
DROP POLICY IF EXISTS sms_colaborador_treinamentos_scoped ON public.sms_colaborador_treinamentos;
CREATE POLICY sms_colaborador_treinamentos_scoped
  ON public.sms_colaborador_treinamentos FOR ALL TO authenticated
  USING (public.can_manage_sms_record(obra_id, colaborador_id))
  WITH CHECK (public.can_manage_sms_record(obra_id, colaborador_id));

DROP POLICY IF EXISTS sms_p_desvios ON public.sms_desvios;
DROP POLICY IF EXISTS sms_desvios_scoped ON public.sms_desvios;
CREATE POLICY sms_desvios_scoped
  ON public.sms_desvios FOR ALL TO authenticated
  USING (public.can_manage_sms_record(obra_id, colaborador_id))
  WITH CHECK (public.can_manage_sms_record(obra_id, colaborador_id));

DROP POLICY IF EXISTS sms_p_epis_est ON public.sms_epis_estoque;
DROP POLICY IF EXISTS sms_epis_estoque_scoped ON public.sms_epis_estoque;
CREATE POLICY sms_epis_estoque_scoped
  ON public.sms_epis_estoque FOR ALL TO authenticated
  USING (public.can_manage_sms_record(obra_id))
  WITH CHECK (public.can_manage_sms_record(obra_id));

DROP POLICY IF EXISTS sms_p_insp ON public.sms_inspecoes;
DROP POLICY IF EXISTS sms_inspecoes_scoped ON public.sms_inspecoes;
CREATE POLICY sms_inspecoes_scoped
  ON public.sms_inspecoes FOR ALL TO authenticated
  USING (public.can_manage_sms_record(obra_id))
  WITH CHECK (public.can_manage_sms_record(obra_id));

DROP POLICY IF EXISTS sms_p_insp_resp ON public.sms_inspecoes_respostas;
DROP POLICY IF EXISTS sms_inspecoes_respostas_scoped ON public.sms_inspecoes_respostas;
CREATE POLICY sms_inspecoes_respostas_scoped
  ON public.sms_inspecoes_respostas FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sms_inspecoes inspecao
      WHERE inspecao.id = inspecao_id
        AND public.can_manage_sms_record(inspecao.obra_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sms_inspecoes inspecao
      WHERE inspecao.id = inspecao_id
        AND public.can_manage_sms_record(inspecao.obra_id)
    )
  );

DROP POLICY IF EXISTS sms_p_rdo ON public.sms_rdo;
DROP POLICY IF EXISTS sms_rdo_scoped ON public.sms_rdo;
CREATE POLICY sms_rdo_scoped
  ON public.sms_rdo FOR ALL TO authenticated
  USING (public.can_manage_sms_record(obra_id))
  WITH CHECK (public.can_manage_sms_record(obra_id));
