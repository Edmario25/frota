-- Isola qualidade, portal do cliente e controle de visitantes por obra.

DROP POLICY IF EXISTS nc_select ON public.nao_conformidades;
DROP POLICY IF EXISTS nc_write ON public.nao_conformidades;
DROP POLICY IF EXISTS nao_conformidades_scoped ON public.nao_conformidades;
CREATE POLICY nao_conformidades_scoped
  ON public.nao_conformidades FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS nc_acoes_select ON public.nc_acoes;
DROP POLICY IF EXISTS nc_acoes_write ON public.nc_acoes;
DROP POLICY IF EXISTS nc_acoes_scoped ON public.nc_acoes;
CREATE POLICY nc_acoes_scoped
  ON public.nc_acoes FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nao_conformidades nc
      WHERE nc.id = nc_id AND public.can_manage_obra_data(nc.obra_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nao_conformidades nc
      WHERE nc.id = nc_id AND public.can_manage_obra_data(nc.obra_id)
    )
  );

DROP POLICY IF EXISTS nc_evid_select ON public.nc_evidencias;
DROP POLICY IF EXISTS nc_evid_write ON public.nc_evidencias;
DROP POLICY IF EXISTS nc_evidencias_scoped ON public.nc_evidencias;
CREATE POLICY nc_evidencias_scoped
  ON public.nc_evidencias FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nao_conformidades nc
      WHERE nc.id = nc_id AND public.can_manage_obra_data(nc.obra_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nao_conformidades nc
      WHERE nc.id = nc_id AND public.can_manage_obra_data(nc.obra_id)
    )
  );

DROP POLICY IF EXISTS portal_cfg_sel ON public.portal_config;
DROP POLICY IF EXISTS portal_cfg_wri ON public.portal_config;
DROP POLICY IF EXISTS portal_config_scoped ON public.portal_config;
CREATE POLICY portal_config_scoped
  ON public.portal_config FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS portal_foto_sel ON public.portal_fotos;
DROP POLICY IF EXISTS portal_foto_wri ON public.portal_fotos;
DROP POLICY IF EXISTS portal_fotos_scoped ON public.portal_fotos;
CREATE POLICY portal_fotos_scoped
  ON public.portal_fotos FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS portal_doc_sel ON public.portal_documentos;
DROP POLICY IF EXISTS portal_doc_wri ON public.portal_documentos;
DROP POLICY IF EXISTS portal_documentos_scoped ON public.portal_documentos;
CREATE POLICY portal_documentos_scoped
  ON public.portal_documentos FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS portal_atu_sel ON public.portal_atualizacoes;
DROP POLICY IF EXISTS portal_atu_wri ON public.portal_atualizacoes;
DROP POLICY IF EXISTS portal_atualizacoes_scoped ON public.portal_atualizacoes;
CREATE POLICY portal_atualizacoes_scoped
  ON public.portal_atualizacoes FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

ALTER TABLE public.visitantes
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id)
  DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.can_manage_visitor(target_visitor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    public.get_user_role(auth.uid()) IN ('admin', 'gestor_contrato', 'gestor_frota')
    OR EXISTS (
      SELECT 1 FROM public.visitantes visitante
      WHERE visitante.id = target_visitor_id
        AND visitante.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.visitas visita
      WHERE visita.visitante_id = target_visitor_id
        AND public.can_manage_obra_data(visita.obra_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_visitor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_visitor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_visitor(uuid) TO authenticated;

DROP POLICY IF EXISTS visit_sel ON public.visitantes;
DROP POLICY IF EXISTS visit_wri ON public.visitantes;
DROP POLICY IF EXISTS visitantes_select_scoped ON public.visitantes;
DROP POLICY IF EXISTS visitantes_insert_scoped ON public.visitantes;
DROP POLICY IF EXISTS visitantes_update_scoped ON public.visitantes;
DROP POLICY IF EXISTS visitantes_delete_scoped ON public.visitantes;

CREATE POLICY visitantes_select_scoped
  ON public.visitantes FOR SELECT TO authenticated
  USING (public.can_manage_visitor(id));
CREATE POLICY visitantes_insert_scoped
  ON public.visitantes FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.get_user_role(auth.uid()) IN (
      'admin', 'gestor_contrato', 'gestor_frota', 'gestor_obra'
    )
  );
CREATE POLICY visitantes_update_scoped
  ON public.visitantes FOR UPDATE TO authenticated
  USING (public.can_manage_visitor(id))
  WITH CHECK (public.can_manage_visitor(id));
CREATE POLICY visitantes_delete_scoped
  ON public.visitantes FOR DELETE TO authenticated
  USING (public.can_manage_visitor(id));

DROP POLICY IF EXISTS visitas_sel ON public.visitas;
DROP POLICY IF EXISTS visitas_wri ON public.visitas;
DROP POLICY IF EXISTS visitas_scoped ON public.visitas;
CREATE POLICY visitas_scoped
  ON public.visitas FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (
    public.can_manage_obra_data(obra_id)
    AND public.can_manage_visitor(visitante_id)
  );

ALTER VIEW public.v_nc_resumo SET (security_invoker = true);
ALTER VIEW public.v_portal_resumo SET (security_invoker = true);
ALTER VIEW public.v_visitas_ativas SET (security_invoker = true);
ALTER VIEW public.v_visitantes_kpi SET (security_invoker = true);
