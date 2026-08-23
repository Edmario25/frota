-- Mantem os catalogos SMS visiveis para usuarios autenticados, mas impede
-- que contas operacionais alterem referencias compartilhadas pelo sistema.

CREATE OR REPLACE FUNCTION public.is_sms_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.get_user_role(auth.uid()) IN (
    'admin',
    'gestor_contrato',
    'gestor_frota',
    'gestor_obra',
    'tecnico_sms'
  );
$$;

REVOKE ALL ON FUNCTION public.is_sms_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_sms_manager() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_sms_manager() TO authenticated;

DROP POLICY IF EXISTS sms_p_apr_riscos ON public.sms_apr_riscos_catalogo;
CREATE POLICY sms_apr_riscos_catalogo_select
  ON public.sms_apr_riscos_catalogo FOR SELECT TO authenticated
  USING (true);
CREATE POLICY sms_apr_riscos_catalogo_manage
  ON public.sms_apr_riscos_catalogo FOR ALL TO authenticated
  USING (public.is_sms_manager())
  WITH CHECK (public.is_sms_manager());

DROP POLICY IF EXISTS sms_p_apr_tipos ON public.sms_apr_tipos_atividade;
CREATE POLICY sms_apr_tipos_atividade_select
  ON public.sms_apr_tipos_atividade FOR SELECT TO authenticated
  USING (true);
CREATE POLICY sms_apr_tipos_atividade_manage
  ON public.sms_apr_tipos_atividade FOR ALL TO authenticated
  USING (public.is_sms_manager())
  WITH CHECK (public.is_sms_manager());

DROP POLICY IF EXISTS sms_p_dds_temas ON public.sms_dds_temas;
CREATE POLICY sms_dds_temas_select
  ON public.sms_dds_temas FOR SELECT TO authenticated
  USING (true);
CREATE POLICY sms_dds_temas_manage
  ON public.sms_dds_temas FOR ALL TO authenticated
  USING (public.is_sms_manager())
  WITH CHECK (public.is_sms_manager());

DROP POLICY IF EXISTS sms_p_epis_cat ON public.sms_epis_catalogo;
CREATE POLICY sms_epis_catalogo_select
  ON public.sms_epis_catalogo FOR SELECT TO authenticated
  USING (true);
CREATE POLICY sms_epis_catalogo_manage
  ON public.sms_epis_catalogo FOR ALL TO authenticated
  USING (public.is_sms_manager())
  WITH CHECK (public.is_sms_manager());

DROP POLICY IF EXISTS sms_p_insp_cat ON public.sms_inspecoes_catalogo;
CREATE POLICY sms_inspecoes_catalogo_select
  ON public.sms_inspecoes_catalogo FOR SELECT TO authenticated
  USING (true);
CREATE POLICY sms_inspecoes_catalogo_manage
  ON public.sms_inspecoes_catalogo FOR ALL TO authenticated
  USING (public.is_sms_manager())
  WITH CHECK (public.is_sms_manager());

DROP POLICY IF EXISTS sms_p_insp_itens ON public.sms_inspecoes_itens_catalogo;
CREATE POLICY sms_inspecoes_itens_catalogo_select
  ON public.sms_inspecoes_itens_catalogo FOR SELECT TO authenticated
  USING (true);
CREATE POLICY sms_inspecoes_itens_catalogo_manage
  ON public.sms_inspecoes_itens_catalogo FOR ALL TO authenticated
  USING (public.is_sms_manager())
  WITH CHECK (public.is_sms_manager());

DROP POLICY IF EXISTS sms_p_trein_cat ON public.sms_treinamentos_catalogo;
CREATE POLICY sms_treinamentos_catalogo_select
  ON public.sms_treinamentos_catalogo FOR SELECT TO authenticated
  USING (true);
CREATE POLICY sms_treinamentos_catalogo_manage
  ON public.sms_treinamentos_catalogo FOR ALL TO authenticated
  USING (public.is_sms_manager())
  WITH CHECK (public.is_sms_manager());
