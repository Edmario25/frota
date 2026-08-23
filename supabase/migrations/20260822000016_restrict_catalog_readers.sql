-- Mantem catalogos globais, mas limita a leitura aos perfis dos modulos
-- correspondentes. Quatro configuracoes compartilhadas permanecem abertas
-- para authenticated por necessidade funcional documentada.

CREATE OR REPLACE FUNCTION public.is_operational_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.get_user_role(auth.uid()) IN (
    'admin', 'gestor_contrato', 'gestor_frota', 'gestor_obra'
  );
$$;

REVOKE ALL ON FUNCTION public.is_operational_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_operational_manager() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_operational_manager() TO authenticated;

DROP POLICY IF EXISTS ferr_cat_select ON public.ferramentas_catalogo;
DROP POLICY IF EXISTS ferramentas_catalogo_select_managers
  ON public.ferramentas_catalogo;
CREATE POLICY ferramentas_catalogo_select_managers
  ON public.ferramentas_catalogo FOR SELECT TO authenticated
  USING (public.is_operational_manager());

DROP POLICY IF EXISTS forn_select ON public.fornecedores;
DROP POLICY IF EXISTS fornecedores_select_managers ON public.fornecedores;
CREATE POLICY fornecedores_select_managers
  ON public.fornecedores FOR SELECT TO authenticated
  USING (public.is_operational_manager());

DROP POLICY IF EXISTS mat_select ON public.materiais_catalogo;
DROP POLICY IF EXISTS materiais_catalogo_select_managers
  ON public.materiais_catalogo;
CREATE POLICY materiais_catalogo_select_managers
  ON public.materiais_catalogo FOR SELECT TO authenticated
  USING (public.is_operational_manager());

DROP POLICY IF EXISTS orc_cat_select ON public.orcamento_categorias;
DROP POLICY IF EXISTS orcamento_categorias_select_managers
  ON public.orcamento_categorias;
CREATE POLICY orcamento_categorias_select_managers
  ON public.orcamento_categorias FOR SELECT TO authenticated
  USING (public.is_operational_manager());

DROP POLICY IF EXISTS sms_apr_riscos_catalogo_select
  ON public.sms_apr_riscos_catalogo;
DROP POLICY IF EXISTS sms_apr_riscos_catalogo_select_sms
  ON public.sms_apr_riscos_catalogo;
CREATE POLICY sms_apr_riscos_catalogo_select_sms
  ON public.sms_apr_riscos_catalogo FOR SELECT TO authenticated
  USING (public.is_sms_manager());

DROP POLICY IF EXISTS sms_apr_tipos_atividade_select
  ON public.sms_apr_tipos_atividade;
DROP POLICY IF EXISTS sms_apr_tipos_atividade_select_sms
  ON public.sms_apr_tipos_atividade;
CREATE POLICY sms_apr_tipos_atividade_select_sms
  ON public.sms_apr_tipos_atividade FOR SELECT TO authenticated
  USING (public.is_sms_manager());

DROP POLICY IF EXISTS sms_cargo_requisitos_select_all
  ON public.sms_cargo_requisitos;
DROP POLICY IF EXISTS sms_cargo_requisitos_select_sms
  ON public.sms_cargo_requisitos;
CREATE POLICY sms_cargo_requisitos_select_sms
  ON public.sms_cargo_requisitos FOR SELECT TO authenticated
  USING (public.is_sms_manager());

DROP POLICY IF EXISTS sms_dds_temas_select ON public.sms_dds_temas;
DROP POLICY IF EXISTS sms_dds_temas_select_sms ON public.sms_dds_temas;
CREATE POLICY sms_dds_temas_select_sms
  ON public.sms_dds_temas FOR SELECT TO authenticated
  USING (public.is_sms_manager());

DROP POLICY IF EXISTS sms_empresas_select_all ON public.sms_empresas;
DROP POLICY IF EXISTS sms_empresas_select_sms ON public.sms_empresas;
CREATE POLICY sms_empresas_select_sms
  ON public.sms_empresas FOR SELECT TO authenticated
  USING (public.is_sms_manager());

DROP POLICY IF EXISTS sms_epis_catalogo_select ON public.sms_epis_catalogo;
DROP POLICY IF EXISTS sms_epis_catalogo_select_sms ON public.sms_epis_catalogo;
CREATE POLICY sms_epis_catalogo_select_sms
  ON public.sms_epis_catalogo FOR SELECT TO authenticated
  USING (public.is_sms_manager());

DROP POLICY IF EXISTS sms_inspecoes_catalogo_select
  ON public.sms_inspecoes_catalogo;
DROP POLICY IF EXISTS sms_inspecoes_catalogo_select_sms
  ON public.sms_inspecoes_catalogo;
CREATE POLICY sms_inspecoes_catalogo_select_sms
  ON public.sms_inspecoes_catalogo FOR SELECT TO authenticated
  USING (public.is_sms_manager());

DROP POLICY IF EXISTS sms_inspecoes_itens_catalogo_select
  ON public.sms_inspecoes_itens_catalogo;
DROP POLICY IF EXISTS sms_inspecoes_itens_catalogo_select_sms
  ON public.sms_inspecoes_itens_catalogo;
CREATE POLICY sms_inspecoes_itens_catalogo_select_sms
  ON public.sms_inspecoes_itens_catalogo FOR SELECT TO authenticated
  USING (public.is_sms_manager());

DROP POLICY IF EXISTS sms_treinamentos_catalogo_select
  ON public.sms_treinamentos_catalogo;
DROP POLICY IF EXISTS sms_treinamentos_catalogo_select_sms
  ON public.sms_treinamentos_catalogo;
CREATE POLICY sms_treinamentos_catalogo_select_sms
  ON public.sms_treinamentos_catalogo FOR SELECT TO authenticated
  USING (public.is_sms_manager());
