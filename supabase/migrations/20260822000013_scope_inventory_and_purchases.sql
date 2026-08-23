-- Isola estoque, movimentacoes, inventario, ordens e requisicoes por obra.

DROP POLICY IF EXISTS estoque_select ON public.almoxarifado_estoque;
DROP POLICY IF EXISTS estoque_write ON public.almoxarifado_estoque;
DROP POLICY IF EXISTS estoque_scoped ON public.almoxarifado_estoque;
CREATE POLICY estoque_scoped
  ON public.almoxarifado_estoque FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS almox_mov_select ON public.almoxarifado_movimentos;
DROP POLICY IF EXISTS almox_mov_write ON public.almoxarifado_movimentos;
DROP POLICY IF EXISTS almox_movimentos_scoped ON public.almoxarifado_movimentos;
CREATE POLICY almox_movimentos_scoped
  ON public.almoxarifado_movimentos FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (
    public.can_manage_obra_data(obra_id)
    AND (
      obra_destino_id IS NULL
      OR public.can_manage_obra_data(obra_destino_id)
    )
  );

DROP POLICY IF EXISTS inv_select ON public.inventario_fisico;
DROP POLICY IF EXISTS inv_write ON public.inventario_fisico;
DROP POLICY IF EXISTS inventario_fisico_scoped ON public.inventario_fisico;
CREATE POLICY inventario_fisico_scoped
  ON public.inventario_fisico FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS inv_itens_select ON public.inventario_itens;
DROP POLICY IF EXISTS inv_itens_write ON public.inventario_itens;
DROP POLICY IF EXISTS inventario_itens_scoped ON public.inventario_itens;
CREATE POLICY inventario_itens_scoped
  ON public.inventario_itens FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventario_fisico inventario
      WHERE inventario.id = inventario_id
        AND public.can_manage_obra_data(inventario.obra_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inventario_fisico inventario
      WHERE inventario.id = inventario_id
        AND public.can_manage_obra_data(inventario.obra_id)
    )
  );

DROP POLICY IF EXISTS oc_select ON public.ordens_compra;
DROP POLICY IF EXISTS oc_write ON public.ordens_compra;
DROP POLICY IF EXISTS ordens_compra_scoped ON public.ordens_compra;
CREATE POLICY ordens_compra_scoped
  ON public.ordens_compra FOR ALL TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS oc_itens_select ON public.ordens_compra_itens;
DROP POLICY IF EXISTS oc_itens_write ON public.ordens_compra_itens;
DROP POLICY IF EXISTS ordens_compra_itens_scoped ON public.ordens_compra_itens;
CREATE POLICY ordens_compra_itens_scoped
  ON public.ordens_compra_itens FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ordens_compra ordem
      WHERE ordem.id = ordem_id
        AND public.can_manage_obra_data(ordem.obra_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ordens_compra ordem
      WHERE ordem.id = ordem_id
        AND public.can_manage_obra_data(ordem.obra_id)
    )
  );

DROP POLICY IF EXISTS req_select ON public.requisicoes_compra;
DROP POLICY IF EXISTS req_select_scoped ON public.requisicoes_compra;
CREATE POLICY req_select_scoped
  ON public.requisicoes_compra FOR SELECT TO authenticated
  USING (
    solicitado_por = auth.uid()
    OR public.can_manage_obra_data(obra_id)
  );

DROP POLICY IF EXISTS req_update ON public.requisicoes_compra;
DROP POLICY IF EXISTS req_update_scoped ON public.requisicoes_compra;
CREATE POLICY req_update_scoped
  ON public.requisicoes_compra FOR UPDATE TO authenticated
  USING (public.can_manage_obra_data(obra_id))
  WITH CHECK (public.can_manage_obra_data(obra_id));

DROP POLICY IF EXISTS req_itens_select ON public.requisicao_itens;
DROP POLICY IF EXISTS req_itens_select_scoped ON public.requisicao_itens;
CREATE POLICY req_itens_select_scoped
  ON public.requisicao_itens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.requisicoes_compra requisicao
      WHERE requisicao.id = requisicao_id
        AND (
          requisicao.solicitado_por = auth.uid()
          OR public.can_manage_obra_data(requisicao.obra_id)
        )
    )
  );

DROP POLICY IF EXISTS req_itens_update ON public.requisicao_itens;
DROP POLICY IF EXISTS req_itens_update_scoped ON public.requisicao_itens;
CREATE POLICY req_itens_update_scoped
  ON public.requisicao_itens FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.requisicoes_compra requisicao
      WHERE requisicao.id = requisicao_id
        AND public.can_manage_obra_data(requisicao.obra_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requisicoes_compra requisicao
      WHERE requisicao.id = requisicao_id
        AND public.can_manage_obra_data(requisicao.obra_id)
    )
  );
