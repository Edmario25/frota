-- Isola dados financeiros e de medicao por obra e garante que as views
-- executem com as permissoes do usuario, respeitando RLS.

DROP POLICY IF EXISTS subcont_select ON public.subcontratadas;
DROP POLICY IF EXISTS subcont_write ON public.subcontratadas;
DROP POLICY IF EXISTS subcont_scoped ON public.subcontratadas;
CREATE POLICY subcont_scoped
  ON public.subcontratadas FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS med_select ON public.medicoes;
DROP POLICY IF EXISTS med_write ON public.medicoes;
DROP POLICY IF EXISTS medicoes_scoped ON public.medicoes;
CREATE POLICY medicoes_scoped
  ON public.medicoes FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS med_itens_select ON public.medicoes_itens;
DROP POLICY IF EXISTS med_itens_write ON public.medicoes_itens;
DROP POLICY IF EXISTS medicoes_itens_scoped ON public.medicoes_itens;
CREATE POLICY medicoes_itens_scoped
  ON public.medicoes_itens FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.medicoes medicao
      WHERE medicao.id = medicao_id
        AND public.can_manage_obra_data(medicao.obra_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medicoes medicao
      WHERE medicao.id = medicao_id
        AND public.can_manage_obra_data(medicao.obra_id)
    )
  );

DROP POLICY IF EXISTS orc_itens_select ON public.orcamento_itens;
DROP POLICY IF EXISTS orc_itens_write ON public.orcamento_itens;
DROP POLICY IF EXISTS orcamento_itens_scoped ON public.orcamento_itens;
CREATE POLICY orcamento_itens_scoped
  ON public.orcamento_itens FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS lancamentos_select ON public.lancamentos_custos;
DROP POLICY IF EXISTS lancamentos_write ON public.lancamentos_custos;
DROP POLICY IF EXISTS lancamentos_custos_scoped ON public.lancamentos_custos;
CREATE POLICY lancamentos_custos_scoped
  ON public.lancamentos_custos FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

ALTER VIEW public.v_subcontratadas_resumo SET (security_invoker = true);
ALTER VIEW public.v_orcado_realizado SET (security_invoker = true);
ALTER VIEW public.v_custos_mensais SET (security_invoker = true);
